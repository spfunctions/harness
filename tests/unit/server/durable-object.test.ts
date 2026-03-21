import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Miniflare } from "miniflare";
import {
  makeCapabilityRequest,
  makeDataMessage,
  makeStateSync,
} from "../../helpers/fixtures.js";
import { encode, toSSEEvent } from "../../../src/protocol/codec.js";

let mf: Miniflare;

beforeAll(async () => {
  mf = new Miniflare({
    modules: [
      {
        type: "ESModule",
        path: "worker.mjs",
        contents: `
          const MAX_EVENT_LOG = 1000;

          export class HarnessDO {
            constructor(state, env) {
              this.state = state;
              this.connections = [];
              this.eventLog = [];
              this.capabilities = new Map();
              this.clientState = null;
              this.token = env.AUTH_TOKEN || null;
              this.state.blockConcurrencyWhile(async () => {
                this.eventLog = (await this.state.storage.get("eventLog")) ?? [];
              });
            }

            async fetch(request) {
              const url = new URL(request.url);

              if (url.pathname !== "/health") {
                const auth = request.headers.get("Authorization");
                if (this.token && auth !== "Bearer " + this.token) {
                  return new Response("Unauthorized", { status: 401 });
                }
              }

              switch (url.pathname) {
                case "/sse":
                  return this.handleSSE(request);
                case "/messages":
                  if (request.method !== "POST") {
                    return new Response("Method not allowed", { status: 405 });
                  }
                  return this.handleIncomingMessage(request);
                case "/state":
                  return this.handleGetState();
                case "/health":
                  return new Response(JSON.stringify({ status: "ok" }), {
                    headers: { "Content-Type": "application/json" },
                  });
                default:
                  return new Response("Not found", { status: 404 });
              }
            }

            handleSSE(request) {
              const lastEventId = request.headers.get("Last-Event-ID") ||
                new URL(request.url).searchParams.get("lastEventId");
              let controller;
              const readable = new ReadableStream({
                start(c) { controller = c; },
              });
              const encoder = new TextEncoder();
              const conn = {
                write: (event) => {
                  const formatted = "id: " + event.id + "\\nevent: " + event.event + "\\ndata: " + event.data + "\\n\\n";
                  controller.enqueue(encoder.encode(formatted));
                },
                close: () => { try { controller.close(); } catch {} },
              };
              this.connections.push(conn);
              if (lastEventId) {
                const events = this.getEventLog(lastEventId);
                for (const event of events) { conn.write(event); }
              }
              return new Response(readable, {
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  "Connection": "keep-alive",
                },
              });
            }

            async handleIncomingMessage(request) {
              try {
                const body = await request.text();
                const message = JSON.parse(body);
                if (!message.type || !message.id) throw new Error("Invalid message");
                await this.handleMessage(message);
                return new Response(JSON.stringify({ ok: true }), {
                  headers: { "Content-Type": "application/json" },
                });
              } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), {
                  status: 400,
                  headers: { "Content-Type": "application/json" },
                });
              }
            }

            async handleMessage(message) {
              const event = { id: message.id, event: message.type, data: JSON.stringify(message) };
              switch (message.type) {
                case "capability-request":
                  this.capabilities.set(message.id, { request: message });
                  this.storeAndBroadcast(message, event);
                  break;
                case "capability-ready":
                  const cap = this.capabilities.get(message.ref);
                  if (cap) cap.ready = message;
                  this.storeAndBroadcast(message, event);
                  break;
                case "data":
                  this.broadcast(event);
                  break;
                case "state-sync":
                  this.clientState = { version: message.version, health: message.health, lastSeen: Date.now() };
                  this.storeAndBroadcast(message, event);
                  break;
                case "negotiate":
                  this.storeAndBroadcast(message, event);
                  break;
              }
            }

            storeAndBroadcast(message, event) {
              this.eventLog.push(event);
              if (this.eventLog.length > MAX_EVENT_LOG) {
                this.eventLog = this.eventLog.slice(-MAX_EVENT_LOG);
              }
              this.state.storage.put("eventLog", this.eventLog);
              this.broadcast(event);
            }

            broadcast(event) {
              const active = [];
              for (const conn of this.connections) {
                try { conn.write(event); active.push(conn); } catch {}
              }
              this.connections = active;
            }

            getEventLog(since) {
              if (!since) return [...this.eventLog];
              const idx = this.eventLog.findIndex(e => e.id === since);
              if (idx === -1) return [...this.eventLog];
              return this.eventLog.slice(idx + 1);
            }

            handleGetState() {
              return new Response(JSON.stringify({
                connections: this.connections.length,
                eventCount: this.eventLog.length,
                clientState: this.clientState,
              }), { headers: { "Content-Type": "application/json" } });
            }
          }

          export default {
            async fetch(request, env) {
              const url = new URL(request.url);

              if (url.pathname === "/health") {
                return new Response(JSON.stringify({ status: "ok" }), {
                  headers: { "Content-Type": "application/json" },
                });
              }

              if (env.AUTH_TOKEN) {
                const auth = request.headers.get("Authorization");
                if (auth !== "Bearer " + env.AUTH_TOKEN) {
                  return new Response("Unauthorized", { status: 401 });
                }
              }

              const id = env.HARNESS_DO.idFromName("main");
              const stub = env.HARNESS_DO.get(id);
              return stub.fetch(request);
            },
          };
        `,
      },
    ],
    durableObjects: {
      HARNESS_DO: "HarnessDO",
    },
    compatibilityDate: "2024-09-25",
    bindings: {
      AUTH_TOKEN: "test-token",
    },
  });
});

afterAll(async () => {
  await mf.dispose();
});

const AUTH_HEADERS = {
  Authorization: "Bearer test-token",
  "Content-Type": "application/json",
};

describe("HarnessDO", () => {
  it("GET /health 返回 200", async () => {
    const res = await mf.dispatchFetch("http://localhost/health");
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("ok");
  });

  it("无效 token 返回 401", async () => {
    const res = await mf.dispatchFetch("http://localhost/state", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("POST /messages 的消息被接受", async () => {
    const msg = makeCapabilityRequest();
    const res = await mf.dispatchFetch("http://localhost/messages", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: encode(msg),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("capability-request 被存入 registry", async () => {
    const msg = makeCapabilityRequest({ id: "cap-test-001" });
    await mf.dispatchFetch("http://localhost/messages", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: encode(msg),
    });

    const stateRes = await mf.dispatchFetch("http://localhost/state", {
      headers: AUTH_HEADERS,
    });
    const state = await stateRes.json() as { eventCount: number };
    expect(state.eventCount).toBeGreaterThan(0);
  });

  it("state-sync 更新 client 侧状态", async () => {
    const msg = makeStateSync({ id: "ss-test-001", version: "v005", health: "ok" });
    await mf.dispatchFetch("http://localhost/messages", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: encode(msg),
    });

    const stateRes = await mf.dispatchFetch("http://localhost/state", {
      headers: AUTH_HEADERS,
    });
    const state = await stateRes.json() as { clientState: { version: string } };
    expect(state.clientState.version).toBe("v005");
  });

  it("GET /state 返回当前状态快照", async () => {
    const res = await mf.dispatchFetch("http://localhost/state", {
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { connections: number; eventCount: number };
    expect(body).toHaveProperty("connections");
    expect(body).toHaveProperty("eventCount");
  });

  it("SSE 连接建立后能收到消息", async () => {
    const sseRes = await mf.dispatchFetch("http://localhost/sse", {
      headers: { Authorization: "Bearer test-token" },
    });
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get("Content-Type")).toBe("text/event-stream");

    // Push a message
    const msg = makeDataMessage({ id: "sse-test-001" });
    await mf.dispatchFetch("http://localhost/messages", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: encode(msg),
    });

    // Read from SSE stream
    const reader = sseRes.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("sse-test-001");
    reader.releaseLock();
  });

  it("data 消息不被存储（只 broadcast）", async () => {
    // Get current event count
    const before = await mf.dispatchFetch("http://localhost/state", {
      headers: AUTH_HEADERS,
    });
    const stateBefore = await before.json() as { eventCount: number };
    const countBefore = stateBefore.eventCount;

    // Send a data message
    const msg = makeDataMessage({ id: "data-nosave-001" });
    await mf.dispatchFetch("http://localhost/messages", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: encode(msg),
    });

    // Event count should not increase for data messages
    const after = await mf.dispatchFetch("http://localhost/state", {
      headers: AUTH_HEADERS,
    });
    const stateAfter = await after.json() as { eventCount: number };
    expect(stateAfter.eventCount).toBe(countBefore);
  });
});

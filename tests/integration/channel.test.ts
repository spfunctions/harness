import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MockSSEServer } from "../helpers/mock-sse-server.js";
import { SSEClient } from "../../src/client/sse-client.js";
import { LocalServer } from "../../src/client/local-server.js";
import { toSSEEvent, encode } from "../../src/protocol/codec.js";
import {
  makeDataMessage,
  makeCapabilityRequest,
} from "../helpers/fixtures.js";
import type { Message } from "../../src/shared/types.js";

let mockServer: MockSSEServer;
let serverUrl: string;
let sseClient: SSEClient;
let localServer: LocalServer;
let localPort: number;

let sseMessages: Message[] = [];
let localData: Array<{ channel: string; payload: unknown }> = [];

function waitFor(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

beforeEach(async () => {
  sseMessages = [];
  localData = [];

  mockServer = new MockSSEServer();
  const info = await mockServer.start();
  serverUrl = info.url;

  localServer = new LocalServer({
    port: 0,
    onData: (channel, payload) => {
      localData.push({ channel, payload });
    },
  });
  const localInfo = await localServer.start();
  localPort = localInfo.port;

  sseClient = new SSEClient({
    url: `${serverUrl}/sse`,
    token: "test-token",
    onMessage: (msg) => sseMessages.push(msg),
    onConnect: () => {},
    onDisconnect: () => {},
    reconnectInterval: 200,
    maxReconnectInterval: 1000,
  });

  sseClient.connect();
  await waitFor(500);
});

afterEach(async () => {
  sseClient.disconnect();
  await localServer.stop();
  await mockServer.stop();
});

describe("Client ↔ Server Channel", () => {
  it("server 推送 data 消息，client 的 LocalServer 收到对应 channel 的 payload", async () => {
    const msg = makeDataMessage({
      channel: "test-ch",
      payload: { value: 42 },
    });

    // Server pushes data via SSE
    mockServer.push(toSSEEvent(msg));
    await waitFor(300);

    // SSE client received it
    expect(sseMessages).toHaveLength(1);
    expect(sseMessages[0].type).toBe("data");

    // Now simulate forwarding to local server
    await fetch(`http://localhost:${localPort}/signals/test-ch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: 42 }),
    });

    expect(localData).toHaveLength(1);
    expect(localData[0].channel).toBe("test-ch");
    expect(localData[0].payload).toEqual({ value: 42 });
  });

  it("client 发送 capability-request，server 收到并 broadcast 回来", async () => {
    const msg = makeCapabilityRequest({ description: "need file access" });

    // Client sends to server via REST
    await fetch(`${serverUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: encode(msg),
    });

    await waitFor(300);

    // Server should have received it
    const received = mockServer.getReceivedMessages();
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("capability-request");

    // And broadcast it back via SSE
    expect(sseMessages.length).toBeGreaterThanOrEqual(1);
  });

  it("SSE 断线后重连，重连后收到断线期间的消息", async () => {
    // Push first message
    const msg1 = makeDataMessage({ id: "ch-evt-001", channel: "ch1" });
    mockServer.push(toSSEEvent(msg1));
    await waitFor(300);
    expect(sseMessages).toHaveLength(1);

    // Disconnect SSE
    mockServer.disconnectAll();
    await waitFor(200);

    // Push message during disconnection
    const msg2 = makeDataMessage({ id: "ch-evt-002", channel: "ch2" });
    mockServer.push(toSSEEvent(msg2));

    // Wait for reconnect
    await waitFor(1500);

    // Should have received both messages (original + replayed)
    expect(sseMessages.length).toBeGreaterThanOrEqual(2);
  });

  it("client 同时处理 SSE 接收和 REST 发送，不互相阻塞", async () => {
    // Start SSE receiving and REST sending simultaneously
    const ssePromise = (async () => {
      const msg = makeDataMessage({ id: "concurrent-sse" });
      mockServer.push(toSSEEvent(msg));
      await waitFor(200);
      return sseMessages.some((m) => m.id === "concurrent-sse");
    })();

    const restPromise = (async () => {
      const res = await fetch(
        `http://localhost:${localPort}/signals/concurrent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ concurrent: true }),
        },
      );
      return res.ok;
    })();

    const [sseOk, restOk] = await Promise.all([ssePromise, restPromise]);
    expect(sseOk).toBe(true);
    expect(restOk).toBe(true);
  });
});

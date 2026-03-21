import type { Message, SSEEvent, MessageType } from "../shared/types.js";
import { decode, encode, toSSEEvent } from "../protocol/codec.js";
import { createSSEStream, formatSSEEvent } from "./sse-server.js";

type SSEConnection = {
  write: (event: SSEEvent) => void;
  close: () => void;
};

type CapabilityEntry = {
  request: Message;
  ready?: Message;
};

const MAX_EVENT_LOG = 1000;

export class HarnessDO implements DurableObject {
  private state: DurableObjectState;
  private connections: SSEConnection[] = [];
  private eventLog: SSEEvent[] = [];
  private capabilities = new Map<string, CapabilityEntry>();
  private clientState: {
    version: string;
    health: string;
    lastSeen: number;
  } | null = null;
  private token: string | null = null;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      this.eventLog =
        (await this.state.storage.get<SSEEvent[]>("eventLog")) ?? [];
      this.token =
        (await this.state.storage.get<string>("token")) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Auth check (skip for health)
    if (url.pathname !== "/health") {
      const auth = request.headers.get("Authorization");
      if (this.token && auth !== `Bearer ${this.token}`) {
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

  private handleSSE(request: Request): Response {
    const lastEventId = request.headers.get("Last-Event-ID") ||
      new URL(request.url).searchParams.get("lastEventId");

    const { readable, write, close } = createSSEStream();

    const conn: SSEConnection = { write, close };
    this.connections.push(conn);

    // Replay events since lastEventId
    if (lastEventId) {
      const events = this.getEventLog(lastEventId);
      for (const event of events) {
        write(event);
      }
    }

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  private async handleIncomingMessage(
    request: Request,
  ): Promise<Response> {
    try {
      const body = await request.text();
      const message = decode(body);
      await this.handleMessage(message);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    switch (message.type) {
      case "capability-request":
        this.capabilities.set(message.id, { request: message });
        this.storeAndBroadcast(message);
        break;
      case "capability-ready":
        {
          const cap = this.capabilities.get(message.ref);
          if (cap) {
            cap.ready = message;
          }
          this.storeAndBroadcast(message);
        }
        break;
      case "data":
        // Fire-and-forget — broadcast but don't store in event log
        this.broadcast(toSSEEvent(message));
        break;
      case "state-sync":
        this.clientState = {
          version: message.version,
          health: message.health,
          lastSeen: Date.now(),
        };
        this.storeAndBroadcast(message);
        break;
      case "negotiate":
        this.storeAndBroadcast(message);
        break;
    }
  }

  private storeAndBroadcast(message: Message): void {
    const event = toSSEEvent(message);
    this.eventLog.push(event);

    // Trim to MAX_EVENT_LOG
    if (this.eventLog.length > MAX_EVENT_LOG) {
      this.eventLog = this.eventLog.slice(-MAX_EVENT_LOG);
    }

    // Persist
    this.state.storage.put("eventLog", this.eventLog);

    this.broadcast(event);
  }

  private broadcast(event: SSEEvent): void {
    const active: SSEConnection[] = [];
    for (const conn of this.connections) {
      try {
        conn.write(event);
        active.push(conn);
      } catch {
        // Connection dead
      }
    }
    this.connections = active;
  }

  private getEventLog(since?: string): SSEEvent[] {
    if (!since) return [...this.eventLog];
    const idx = this.eventLog.findIndex((e) => e.id === since);
    if (idx === -1) return [...this.eventLog];
    return this.eventLog.slice(idx + 1);
  }

  private handleGetState(): Response {
    return new Response(
      JSON.stringify({
        connections: this.connections.length,
        eventCount: this.eventLog.length,
        clientState: this.clientState,
        capabilities: Object.fromEntries(this.capabilities),
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
}

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { Server } from "node:http";
import type { Message, SSEEvent } from "../../src/shared/types.js";
import { decode, toSSEEvent } from "../../src/protocol/codec.js";

type SSEConnection = {
  controller: ReadableStreamDefaultController;
  lastEventId: string | null;
};

export class MockSSEServer {
  private app: Hono;
  private server: Server | null = null;
  private connections: SSEConnection[] = [];
  private eventLog: SSEEvent[] = [];
  private receivedMessages: Message[] = [];
  private requestedPort: number;

  constructor(port?: number) {
    this.requestedPort = port ?? 0;
    this.app = new Hono();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // SSE endpoint
    this.app.get("/sse", (c) => {
      const lastEventId =
        c.req.header("Last-Event-ID") ||
        c.req.query("lastEventId") ||
        null;

      const stream = new ReadableStream({
        start: (controller) => {
          const conn: SSEConnection = { controller, lastEventId };
          this.connections.push(conn);

          // Replay events since lastEventId
          if (lastEventId) {
            const idx = this.eventLog.findIndex(
              (e) => e.id === lastEventId,
            );
            const startIdx = idx === -1 ? 0 : idx + 1;
            for (let i = startIdx; i < this.eventLog.length; i++) {
              const formatted = this.formatSSE(this.eventLog[i]);
              controller.enqueue(new TextEncoder().encode(formatted));
            }
          }
        },
        cancel: () => {
          this.connections = this.connections.filter(
            (c) => c.controller !== undefined,
          );
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    });

    // Message receiving endpoint
    this.app.post("/messages", async (c) => {
      try {
        const body = await c.req.text();
        const msg = decode(body);
        this.receivedMessages.push(msg);
        // Broadcast back
        this.push(toSSEEvent(msg));
        return c.json({ ok: true });
      } catch {
        return c.json({ error: "Invalid message" }, 400);
      }
    });

    // Health
    this.app.get("/health", (c) => c.json({ status: "ok" }));

    // State
    this.app.get("/state", (c) =>
      c.json({
        connections: this.connections.length,
        eventCount: this.eventLog.length,
      }),
    );
  }

  private formatSSE(event: SSEEvent): string {
    return `id: ${event.id}\nevent: ${event.event}\ndata: ${event.data}\n\n`;
  }

  async start(): Promise<{ port: number; url: string }> {
    return new Promise((resolve) => {
      this.server = serve(
        { fetch: this.app.fetch, port: this.requestedPort },
        (info) => {
          resolve({
            port: info.port,
            url: `http://localhost:${info.port}`,
          });
        },
      );
    });
  }

  async stop(): Promise<void> {
    // Close all SSE connections
    for (const conn of this.connections) {
      try {
        conn.controller.close();
      } catch {
        // Already closed
      }
    }
    this.connections = [];

    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
      this.server = null;
    });
  }

  push(event: SSEEvent): void {
    this.eventLog.push(event);
    const formatted = this.formatSSE(event);
    const encoded = new TextEncoder().encode(formatted);
    const activeConns: SSEConnection[] = [];
    for (const conn of this.connections) {
      try {
        conn.controller.enqueue(encoded);
        activeConns.push(conn);
      } catch {
        // Connection closed
      }
    }
    this.connections = activeConns;
  }

  getConnections(): number {
    return this.connections.length;
  }

  getReceivedMessages(): Message[] {
    return [...this.receivedMessages];
  }

  disconnectAll(): void {
    for (const conn of this.connections) {
      try {
        conn.controller.close();
      } catch {
        // Already closed
      }
    }
    this.connections = [];
  }
}

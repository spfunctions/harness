import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { Server } from "node:http";

export type LocalServerConfig = {
  port: number;
  onData: (channel: string, payload: unknown) => void;
};

export class LocalServer {
  private config: LocalServerConfig;
  private app: Hono;
  private server: Server | null = null;
  private dynamicRoutes = new Map<
    string,
    (req: Request) => Response | Promise<Response>
  >();
  private actualPort: number = 0;

  constructor(config: LocalServerConfig) {
    this.config = config;
    this.app = new Hono();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Default signal route
    this.app.post("/signals/:channel", async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }
      const channel = c.req.param("channel");
      const logLine = JSON.stringify({
        time: new Date().toISOString(),
        method: "POST",
        path: `/signals/${channel}`,
      });
      process.stdout.write(logLine + "\n");
      this.config.onData(channel, body);
      return c.json({ ok: true });
    });

    // Dynamic route handler
    this.app.all("/*", async (c) => {
      const path = new URL(c.req.url).pathname;
      const handler = this.dynamicRoutes.get(path);
      if (handler) {
        const logLine = JSON.stringify({
          time: new Date().toISOString(),
          method: c.req.method,
          path,
        });
        process.stdout.write(logLine + "\n");
        return handler(c.req.raw);
      }
      return c.json({ error: "Not found" }, 404);
    });
  }

  async start(): Promise<{ port: number }> {
    return new Promise((resolve) => {
      this.server = serve(
        { fetch: this.app.fetch, port: this.config.port },
        (info) => {
          this.actualPort = info.port;
          resolve({ port: info.port });
        },
      );
    });
  }

  async stop(): Promise<void> {
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

  addRoute(
    path: string,
    handler: (req: Request) => Response | Promise<Response>,
  ): void {
    this.dynamicRoutes.set(path, handler);
  }

  removeRoute(path: string): void {
    this.dynamicRoutes.delete(path);
  }

  listRoutes(): string[] {
    return Array.from(this.dynamicRoutes.keys());
  }
}

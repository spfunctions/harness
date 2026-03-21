import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { Server } from "node:http";
import { CloudflareStorage } from "../../../src/storage/cloudflare-client.js";

let server: Server;
let port: number;
let storage: CloudflareStorage;
const kvStore = new Map<string, string>();

beforeEach(async () => {
  kvStore.clear();
  const app = new Hono();

  app.use("*", async (c, next) => {
    const auth = c.req.header("Authorization");
    if (auth !== "Bearer test-token") return c.json({ error: "unauthorized" }, 401);
    return next();
  });

  app.get("/kv/:key", (c) => {
    const v = kvStore.get(c.req.param("key"));
    if (v === undefined) return c.json({ error: "not found" }, 404);
    try {
      return c.json({ key: c.req.param("key"), value: JSON.parse(v) });
    } catch {
      return c.json({ key: c.req.param("key"), value: v });
    }
  });

  app.put("/kv/:key", async (c) => {
    const body = (await c.req.json()) as { value: unknown };
    kvStore.set(c.req.param("key"), JSON.stringify(body.value));
    return c.json({ ok: true });
  });

  app.delete("/kv/:key", (c) => {
    kvStore.delete(c.req.param("key"));
    return c.json({ ok: true });
  });

  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      port = info.port;
      resolve();
    });
  });

  storage = new CloudflareStorage(`http://localhost:${port}`, "test-token");
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("CloudflareStorage", () => {
  it("kvGet returns null for missing key", async () => {
    expect(await storage.kvGet("missing")).toBeNull();
  });

  it("kvSet + kvGet round trip", async () => {
    await storage.kvSet("test", { hello: "world" });
    const val = await storage.kvGet("test");
    expect(val).toEqual({ hello: "world" });
  });

  it("kvDelete removes key", async () => {
    await storage.kvSet("del-me", "value");
    await storage.kvDelete("del-me");
    expect(await storage.kvGet("del-me")).toBeNull();
  });

  it("kvSet with string value", async () => {
    await storage.kvSet("str", "just a string");
    const val = await storage.kvGet("str");
    expect(val).toBe("just a string");
  });

  it("kvSet with number value", async () => {
    await storage.kvSet("num", 42);
    const val = await storage.kvGet("num");
    expect(val).toBe(42);
  });

  it("auth failure throws", async () => {
    const badStorage = new CloudflareStorage(
      `http://localhost:${port}`,
      "wrong-token",
    );
    await expect(badStorage.kvGet("x")).rejects.toThrow();
  });
});

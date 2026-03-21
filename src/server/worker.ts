import { Hono } from "hono";

export { HarnessDO } from "./durable-object.js";

type Env = {
  HARNESS_DO: DurableObjectNamespace;
  HARNESS_KV?: KVNamespace;
  HARNESS_R2?: R2Bucket;
  AUTH_TOKEN?: string;
};

const app = new Hono<{ Bindings: Env }>();

// Auth middleware — skip for /health
app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  if (!c.env.AUTH_TOKEN) return next();
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (token !== c.env.AUTH_TOKEN) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
});

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// SSE subscription (both client and server connect here)
app.get("/sse", async (c) => {
  const stub = getDO(c.env);
  return stub.fetch(c.req.raw);
});

// Message delivery (both sides POST here)
app.post("/messages", async (c) => {
  const stub = getDO(c.env);
  return stub.fetch(c.req.raw);
});

// State snapshot
app.get("/state", async (c) => {
  const stub = getDO(c.env);
  return stub.fetch(c.req.raw);
});

// KV proxy — generic key-value for both daemons
app.get("/kv/:key", async (c) => {
  if (!c.env.HARNESS_KV) return c.json({ error: "KV not configured" }, 500);
  const value = await c.env.HARNESS_KV.get(c.req.param("key"));
  if (value === null) return c.json({ error: "not found" }, 404);
  try {
    return c.json({ key: c.req.param("key"), value: JSON.parse(value) });
  } catch {
    return c.json({ key: c.req.param("key"), value });
  }
});

app.put("/kv/:key", async (c) => {
  if (!c.env.HARNESS_KV) return c.json({ error: "KV not configured" }, 500);
  const body = (await c.req.json()) as { value: unknown; ttl?: number };
  await c.env.HARNESS_KV.put(
    c.req.param("key"),
    JSON.stringify(body.value),
    body.ttl ? { expirationTtl: body.ttl } : undefined,
  );
  return c.json({ ok: true });
});

app.delete("/kv/:key", async (c) => {
  if (!c.env.HARNESS_KV) return c.json({ error: "KV not configured" }, 500);
  await c.env.HARNESS_KV.delete(c.req.param("key"));
  return c.json({ ok: true });
});

// R2 proxy — large files (optional)
app.get("/r2/:key", async (c) => {
  if (!c.env.HARNESS_R2) return c.json({ error: "R2 not configured" }, 500);
  const obj = await c.env.HARNESS_R2.get(c.req.param("key"));
  if (!obj) return c.json({ error: "not found" }, 404);
  return new Response(obj.body);
});

app.put("/r2/:key", async (c) => {
  if (!c.env.HARNESS_R2) return c.json({ error: "R2 not configured" }, 500);
  await c.env.HARNESS_R2.put(c.req.param("key"), c.req.raw.body);
  return c.json({ ok: true });
});

function getDO(env: Env): DurableObjectStub {
  const id = env.HARNESS_DO.idFromName("main");
  return env.HARNESS_DO.get(id);
}

export default app;

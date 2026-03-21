import { Hono } from "hono";

export { HarnessDO } from "./durable-object.js";

type Env = {
  HARNESS_DO: DurableObjectNamespace;
  HARNESS_KV?: KVNamespace;
  AUTH_TOKEN?: string;
  PI_API_KEY?: string;
};

const app = new Hono<{ Bindings: Env }>();

function getDO(env: Env): DurableObjectStub {
  const id = env.HARNESS_DO.idFromName("main");
  return env.HARNESS_DO.get(id);
}

function checkAuth(
  req: Request,
  env: Env,
): Response | null {
  if (!env.AUTH_TOKEN) return null;
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${env.AUTH_TOKEN}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

app.get("/sse", async (c) => {
  const authErr = checkAuth(c.req.raw, c.env);
  if (authErr) return authErr;
  const stub = getDO(c.env);
  return stub.fetch(c.req.raw);
});

app.post("/messages", async (c) => {
  const authErr = checkAuth(c.req.raw, c.env);
  if (authErr) return authErr;
  const stub = getDO(c.env);
  return stub.fetch(c.req.raw);
});

app.get("/state", async (c) => {
  const authErr = checkAuth(c.req.raw, c.env);
  if (authErr) return authErr;
  const stub = getDO(c.env);
  return stub.fetch(c.req.raw);
});

app.post("/deploy", async (c) => {
  const authErr = checkAuth(c.req.raw, c.env);
  if (authErr) return authErr;
  // Phase 0: stub
  return c.json({ status: "deploy not implemented in Phase 0" });
});

app.get("/pi-config", async (c) => {
  const authErr = checkAuth(c.req.raw, c.env);
  if (authErr) return authErr;
  let piConfig = null;
  if (c.env.HARNESS_KV) {
    const raw = await c.env.HARNESS_KV.get("pi-config");
    if (raw) piConfig = JSON.parse(raw);
  }
  return c.json({
    ...(piConfig ?? {}),
    apiKey: c.env.PI_API_KEY ?? null,
  });
});

// Source sync routes
app.put("/sources/:filepath{.*}", async (c) => {
  const authErr = checkAuth(c.req.raw, c.env);
  if (authErr) return authErr;
  const filepath = c.req.param("filepath");
  if (!c.env.HARNESS_KV) return c.json({ error: "KV not configured" }, 500);
  const content = await c.req.text();
  await c.env.HARNESS_KV.put(`source:${filepath}`, content);
  return c.json({ ok: true });
});

app.get("/sources/:filepath{.*}", async (c) => {
  const authErr = checkAuth(c.req.raw, c.env);
  if (authErr) return authErr;
  const filepath = c.req.param("filepath");
  if (!c.env.HARNESS_KV) return c.json({ error: "KV not configured" }, 500);
  const content = await c.env.HARNESS_KV.get(`source:${filepath}`);
  if (!content) return c.text("Not found", 404);
  return c.text(content);
});

app.get("/sources", async (c) => {
  const authErr = checkAuth(c.req.raw, c.env);
  if (authErr) return authErr;
  if (!c.env.HARNESS_KV) return c.json({ error: "KV not configured" }, 500);
  const list = await c.env.HARNESS_KV.list({ prefix: "source:" });
  const files = list.keys.map((k) => k.name.replace("source:", ""));
  return c.json({ files });
});

// Dashboard state
app.get("/improve/dashboard", async (c) => {
  const authErr = checkAuth(c.req.raw, c.env);
  if (authErr) return authErr;
  if (!c.env.HARNESS_KV) return c.json({ error: "KV not configured" }, 500);
  const raw = await c.env.HARNESS_KV.get("improve:dashboard");
  if (!raw) return c.json({ health: "paused", cycle_count: 0 });
  return c.json(JSON.parse(raw));
});

app.put("/improve/dashboard", async (c) => {
  const authErr = checkAuth(c.req.raw, c.env);
  if (authErr) return authErr;
  if (!c.env.HARNESS_KV) return c.json({ error: "KV not configured" }, 500);
  const body = await c.req.text();
  await c.env.HARNESS_KV.put("improve:dashboard", body);
  return c.json({ ok: true });
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

export default app;

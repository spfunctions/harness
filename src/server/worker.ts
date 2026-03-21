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

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

export default app;

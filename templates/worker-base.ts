// Base Worker template — server pi can fork this to create new Workers
// Includes: hono router, auth middleware, basic health check

import { Hono } from "hono";

type Env = {
  HARNESS_TOKEN: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (token !== c.env.HARNESS_TOKEN) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

app.get("/health", (c) => c.json({ status: "ok" }));

// === Add custom routes below ===

export default app;

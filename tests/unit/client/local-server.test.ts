import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalServer } from "../../../src/client/local-server.js";

let server: LocalServer;
let receivedData: Array<{ channel: string; payload: unknown }> = [];
let port: number;

beforeEach(async () => {
  receivedData = [];
  server = new LocalServer({
    port: 0,
    onData: (channel, payload) => {
      receivedData.push({ channel, payload });
    },
  });
  const info = await server.start();
  port = info.port;
});

afterEach(async () => {
  await server.stop();
});

describe("LocalServer", () => {
  it("start() 返回实际监听端口", () => {
    expect(port).toBeGreaterThan(0);
  });

  it("POST /signals/:channel 触发 onData 回调", async () => {
    const res = await fetch(`http://localhost:${port}/signals/test-ch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "value" }),
    });
    expect(res.status).toBe(200);
    expect(receivedData).toHaveLength(1);
  });

  it("onData 收到正确的 channel 和 payload", async () => {
    await fetch(`http://localhost:${port}/signals/my-channel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: 42 }),
    });
    expect(receivedData[0].channel).toBe("my-channel");
    expect(receivedData[0].payload).toEqual({ data: 42 });
  });

  it("addRoute 动态添加新路由", async () => {
    server.addRoute("/custom", () => new Response("custom response"));
    const res = await fetch(`http://localhost:${port}/custom`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("custom response");
  });

  it("removeRoute 移除已有路由", async () => {
    server.addRoute("/temp", () => new Response("temp"));
    server.removeRoute("/temp");
    const res = await fetch(`http://localhost:${port}/temp`);
    expect(res.status).toBe(404);
  });

  it("listRoutes 返回当前所有路由", () => {
    server.addRoute("/a", () => new Response("a"));
    server.addRoute("/b", () => new Response("b"));
    const routes = server.listRoutes();
    expect(routes).toContain("/a");
    expect(routes).toContain("/b");
    expect(routes).toHaveLength(2);
  });

  it("未注册路由返回 404", async () => {
    const res = await fetch(`http://localhost:${port}/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it("stop() 后端口释放", async () => {
    await server.stop();
    // Create a new server on the same port to verify it's freed
    const server2 = new LocalServer({
      port,
      onData: () => {},
    });
    const info2 = await server2.start();
    expect(info2.port).toBe(port);
    await server2.stop();
  });

  it("POST body 不是 JSON 时返回 400", async () => {
    const res = await fetch(`http://localhost:${port}/signals/test`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });
});

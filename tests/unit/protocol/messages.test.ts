import { describe, it, expect } from "vitest";
import {
  createCapabilityRequest,
  createCapabilityReady,
  createDataMessage,
  createStateSync,
  createNegotiate,
} from "../../../src/protocol/messages.js";

describe("createCapabilityRequest", () => {
  it("生成有效的 capability-request 消息", () => {
    const msg = createCapabilityRequest("client", "need storage");
    expect(msg.type).toBe("capability-request");
    expect(msg.from).toBe("client");
    expect(msg.description).toBe("need storage");
  });

  it("id 不为空且唯一", () => {
    const a = createCapabilityRequest("client", "a");
    const b = createCapabilityRequest("client", "b");
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it("timestamp 是合理的 unix 毫秒时间戳", () => {
    const msg = createCapabilityRequest("client", "test");
    const now = Date.now();
    expect(msg.timestamp).toBeGreaterThan(now - 5000);
    expect(msg.timestamp).toBeLessThanOrEqual(now);
  });

  it("schema 可选，不传时字段不存在", () => {
    const without = createCapabilityRequest("client", "test");
    expect("schema" in without).toBe(false);

    const with_ = createCapabilityRequest("client", "test", { type: "object" });
    expect(with_.schema).toEqual({ type: "object" });
  });
});

describe("createCapabilityReady", () => {
  it("生成有效的 capability-ready 消息", () => {
    const msg = createCapabilityReady("server", "ref-1", "/api/v1");
    expect(msg.type).toBe("capability-ready");
    expect(msg.from).toBe("server");
    expect(msg.endpoint).toBe("/api/v1");
  });

  it("ref 字段正确引用原始请求 id", () => {
    const msg = createCapabilityReady("server", "req-123", "/api");
    expect(msg.ref).toBe("req-123");
  });

  it("meta 可选", () => {
    const without = createCapabilityReady("server", "ref", "/api");
    expect("meta" in without).toBe(false);

    const with_ = createCapabilityReady("server", "ref", "/api", {
      version: "1.0",
    });
    expect(with_.meta).toEqual({ version: "1.0" });
  });
});

describe("createDataMessage", () => {
  it("生成有效的 data 消息", () => {
    const msg = createDataMessage("client", "ch1", { x: 1 });
    expect(msg.type).toBe("data");
    expect(msg.channel).toBe("ch1");
  });

  it("payload 可以是任意 JSON-serializable 值", () => {
    expect(createDataMessage("client", "c", { a: 1 }).payload).toEqual({
      a: 1,
    });
    expect(createDataMessage("client", "c", [1, 2]).payload).toEqual([1, 2]);
    expect(createDataMessage("client", "c", "hello").payload).toBe("hello");
    expect(createDataMessage("client", "c", 42).payload).toBe(42);
    expect(createDataMessage("client", "c", null).payload).toBeNull();
  });
});

describe("createStateSync", () => {
  it("生成有效的 state-sync 消息", () => {
    const msg = createStateSync("client", "v001", [], "ok");
    expect(msg.type).toBe("state-sync");
    expect(msg.version).toBe("v001");
    expect(msg.health).toBe("ok");
  });

  it("processes 可以为空数组", () => {
    const msg = createStateSync("client", "v001", [], "ok");
    expect(msg.processes).toEqual([]);
  });

  it("health 只接受 ok/degraded/error", () => {
    expect(createStateSync("client", "v001", [], "ok").health).toBe("ok");
    expect(createStateSync("client", "v001", [], "degraded").health).toBe(
      "degraded",
    );
    expect(createStateSync("client", "v001", [], "error").health).toBe(
      "error",
    );
  });
});

describe("createNegotiate", () => {
  it("生成有效的 negotiate 消息", () => {
    const msg = createNegotiate("client", "ref-1", "how about JSON?");
    expect(msg.type).toBe("negotiate");
    expect(msg.ref).toBe("ref-1");
    expect(msg.content).toBe("how about JSON?");
  });

  it("content 可以是空字符串", () => {
    const msg = createNegotiate("client", "ref-1", "");
    expect(msg.content).toBe("");
  });
});

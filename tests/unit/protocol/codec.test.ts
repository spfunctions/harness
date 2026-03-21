import { describe, it, expect } from "vitest";
import { encode, decode, toSSEEvent, fromSSEEvent } from "../../../src/protocol/codec.js";
import { HarnessError } from "../../../src/shared/errors.js";
import {
  makeCapabilityRequest,
  makeCapabilityReady,
  makeDataMessage,
  makeStateSync,
  makeNegotiate,
  INVALID_MESSAGES,
} from "../../helpers/fixtures.js";

describe("encode", () => {
  it("将 Message 编码为 JSON string", () => {
    const msg = makeCapabilityRequest();
    const encoded = encode(msg);
    expect(typeof encoded).toBe("string");
    expect(JSON.parse(encoded)).toEqual(msg);
  });

  it("输出不含换行符（单行）", () => {
    const msg = makeDataMessage({ payload: { nested: { deep: true } } });
    const encoded = encode(msg);
    expect(encoded).not.toContain("\n");
  });

  it("所有字段都被序列化", () => {
    const msg = makeCapabilityRequest({ schema: { type: "object" } });
    const encoded = encode(msg);
    const parsed = JSON.parse(encoded);
    expect(parsed.type).toBe("capability-request");
    expect(parsed.id).toBe(msg.id);
    expect(parsed.from).toBe(msg.from);
    expect(parsed.description).toBe(msg.description);
    expect(parsed.schema).toEqual({ type: "object" });
    expect(parsed.timestamp).toBe(msg.timestamp);
  });
});

describe("decode", () => {
  it("将有效 JSON string 解码为 Message", () => {
    const msg = makeCapabilityRequest();
    const decoded = decode(JSON.stringify(msg));
    expect(decoded).toEqual(msg);
  });

  it("五种消息类型都能正确解码", () => {
    const messages = [
      makeCapabilityRequest(),
      makeCapabilityReady(),
      makeDataMessage(),
      makeStateSync(),
      makeNegotiate(),
    ];
    for (const msg of messages) {
      const decoded = decode(JSON.stringify(msg));
      expect(decoded).toEqual(msg);
    }
  });

  it("无效 JSON 抛出 HarnessError INVALID_MESSAGE", () => {
    expect(() => decode(INVALID_MESSAGES.notJson)).toThrow(HarnessError);
    try {
      decode(INVALID_MESSAGES.notJson);
    } catch (e) {
      expect((e as HarnessError).code).toBe("INVALID_MESSAGE");
    }
  });

  it("空字符串抛出 HarnessError INVALID_MESSAGE", () => {
    expect(() => decode(INVALID_MESSAGES.emptyString)).toThrow(HarnessError);
    try {
      decode(INVALID_MESSAGES.emptyString);
    } catch (e) {
      expect((e as HarnessError).code).toBe("INVALID_MESSAGE");
    }
  });

  it("缺少 type 字段抛出 HarnessError MISSING_FIELD", () => {
    try {
      decode(INVALID_MESSAGES.missingType);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(HarnessError);
      expect((e as HarnessError).code).toBe("MISSING_FIELD");
    }
  });

  it("未知 type 值抛出 HarnessError UNKNOWN_MESSAGE_TYPE", () => {
    try {
      decode(INVALID_MESSAGES.unknownType);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(HarnessError);
      expect((e as HarnessError).code).toBe("UNKNOWN_MESSAGE_TYPE");
    }
  });

  it("缺少必填字段抛出 HarnessError MISSING_FIELD", () => {
    try {
      decode(INVALID_MESSAGES.missingId);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(HarnessError);
      expect((e as HarnessError).code).toBe("MISSING_FIELD");
    }
  });

  it("from 字段不是 client/server 时抛出 HarnessError INVALID_MESSAGE", () => {
    try {
      decode(INVALID_MESSAGES.invalidFrom);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(HarnessError);
      expect((e as HarnessError).code).toBe("INVALID_MESSAGE");
    }
  });
});

describe("data 消息 payload 必填", () => {
  it("有 payload（null）通过", () => {
    const msg = makeDataMessage({ payload: null });
    expect(() => decode(encode(msg))).not.toThrow();
  });

  it("有 payload（{}）通过", () => {
    const msg = makeDataMessage({ payload: {} });
    expect(() => decode(encode(msg))).not.toThrow();
  });

  it("有 payload（string）通过", () => {
    const msg = makeDataMessage({ payload: "hello" });
    expect(() => decode(encode(msg))).not.toThrow();
  });

  it("缺少 payload 字段 → 拒绝", () => {
    const raw = JSON.stringify({
      type: "data",
      id: "test",
      from: "client",
      channel: "test",
      timestamp: 0,
    });
    expect(() => decode(raw)).toThrow(HarnessError);
    try {
      decode(raw);
    } catch (e) {
      expect((e as HarnessError).code).toBe("MISSING_FIELD");
    }
  });
});

describe("channel name 校验", () => {
  it("有效 channel name 通过", () => {
    const valid = [
      "signals/test",
      "my-channel",
      "data_v2",
      "a",
      "A/B/c-d_e",
    ];
    for (const ch of valid) {
      const msg = makeDataMessage({ channel: ch });
      expect(() => decode(encode(msg))).not.toThrow();
    }
  });

  it("空 channel name 被拒绝", () => {
    const raw = JSON.stringify({
      type: "data",
      id: "test",
      from: "client",
      channel: "",
      payload: {},
      timestamp: 0,
    });
    expect(() => decode(raw)).toThrow(HarnessError);
  });

  it("超过 128 字符的 channel name 被拒绝", () => {
    const raw = JSON.stringify({
      type: "data",
      id: "test",
      from: "client",
      channel: "a".repeat(129),
      payload: {},
      timestamp: 0,
    });
    expect(() => decode(raw)).toThrow(HarnessError);
  });

  it("包含特殊字符的 channel name 被拒绝", () => {
    const invalid = ["has space", "中文", "emoji😀", "dot.name", "semi;colon"];
    for (const ch of invalid) {
      const raw = JSON.stringify({
        type: "data",
        id: "test",
        from: "client",
        channel: ch,
        payload: {},
        timestamp: 0,
      });
      expect(() => decode(raw)).toThrow(HarnessError);
    }
  });
});

describe("encode → decode 往返", () => {
  it("五种消息类型 encode 后 decode 得到相同结构", () => {
    const messages = [
      makeCapabilityRequest(),
      makeCapabilityReady(),
      makeDataMessage(),
      makeStateSync(),
      makeNegotiate(),
    ];
    for (const msg of messages) {
      const roundTripped = decode(encode(msg));
      expect(roundTripped).toEqual(msg);
    }
  });
});

describe("toSSEEvent / fromSSEEvent", () => {
  it("toSSEEvent 返回正确的 id/event/data 字段", () => {
    const msg = makeCapabilityRequest();
    const event = toSSEEvent(msg);
    expect(event.id).toBe(msg.id);
    expect(event.event).toBe("capability-request");
    expect(JSON.parse(event.data)).toEqual(msg);
  });

  it("fromSSEEvent 能从 data 字符串还原 Message", () => {
    const msg = makeDataMessage();
    const data = encode(msg);
    const restored = fromSSEEvent(data);
    expect(restored).toEqual(msg);
  });

  it("toSSEEvent → fromSSEEvent 往返一致", () => {
    const messages = [
      makeCapabilityRequest(),
      makeCapabilityReady(),
      makeDataMessage(),
      makeStateSync(),
      makeNegotiate(),
    ];
    for (const msg of messages) {
      const event = toSSEEvent(msg);
      const restored = fromSSEEvent(event.data);
      expect(restored).toEqual(msg);
    }
  });
});

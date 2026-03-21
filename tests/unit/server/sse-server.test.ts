import { describe, it, expect } from "vitest";
import { createSSEStream, formatSSEEvent } from "../../../src/server/sse-server.js";
import type { SSEEvent } from "../../../src/shared/types.js";

describe("formatSSEEvent", () => {
  it("格式化 SSE 事件为正确的字符串格式", () => {
    const event: SSEEvent = {
      id: "evt-001",
      event: "data",
      data: '{"type":"data"}',
    };
    const formatted = formatSSEEvent(event);
    expect(formatted).toBe(
      'id: evt-001\nevent: data\ndata: {"type":"data"}\n\n',
    );
  });
});

describe("createSSEStream", () => {
  it("创建可读流并写入事件", async () => {
    const { readable, write, close } = createSSEStream();
    const reader = readable.getReader();

    const event: SSEEvent = {
      id: "evt-001",
      event: "data",
      data: '{"test":true}',
    };

    write(event);
    close();

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("id: evt-001");
    expect(text).toContain("event: data");
    expect(text).toContain('data: {"test":true}');
  });
});

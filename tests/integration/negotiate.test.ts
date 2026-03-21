import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MockSSEServer } from "../helpers/mock-sse-server.js";
import { SSEClient } from "../../src/client/sse-client.js";
import { toSSEEvent, encode } from "../../src/protocol/codec.js";
import {
  createCapabilityRequest,
  createCapabilityReady,
  createNegotiate,
  createDataMessage,
} from "../../src/protocol/messages.js";
import type { Message } from "../../src/shared/types.js";

let mockServer: MockSSEServer;
let serverUrl: string;
let sseClient: SSEClient;
let received: Message[] = [];

function waitFor(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

beforeEach(async () => {
  received = [];
  mockServer = new MockSSEServer();
  const info = await mockServer.start();
  serverUrl = info.url;

  sseClient = new SSEClient({
    url: `${serverUrl}/sse`,
    token: "test-token",
    onMessage: (msg) => received.push(msg),
    onConnect: () => {},
    onDisconnect: () => {},
    reconnectInterval: 200,
  });
  sseClient.connect();
  await waitFor(500);
});

afterEach(async () => {
  sseClient.disconnect();
  await mockServer.stop();
});

describe("协商流程", () => {
  it("完整的 capability 建立流程：request → ready → data 传输", async () => {
    // 1. Server sends capability-request
    const request = createCapabilityRequest("server", "need compute");
    mockServer.push(toSSEEvent(request));
    await waitFor(300);

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("capability-request");

    // 2. Client responds with capability-ready
    const ready = createCapabilityReady(
      "client",
      request.id,
      "/compute",
    );
    await fetch(`${serverUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: encode(ready),
    });
    await waitFor(300);

    // Should receive the ready broadcast back
    const readyMsg = received.find((m) => m.type === "capability-ready");
    expect(readyMsg).toBeDefined();

    // 3. Data transmission
    const data = createDataMessage("server", "/compute", {
      task: "multiply",
      args: [2, 3],
    });
    mockServer.push(toSSEEvent(data));
    await waitFor(300);

    const dataMsg = received.find((m) => m.type === "data");
    expect(dataMsg).toBeDefined();
  });

  it("带协商的流程：request → negotiate → negotiate → ready → data", async () => {
    // 1. capability-request
    const request = createCapabilityRequest("server", "need storage");
    mockServer.push(toSSEEvent(request));
    await waitFor(300);

    // 2. Client negotiates
    const neg1 = createNegotiate(
      "client",
      request.id,
      "Can you use S3 instead?",
    );
    await fetch(`${serverUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: encode(neg1),
    });
    await waitFor(300);

    // 3. Server counter-negotiates
    const neg2 = createNegotiate(
      "server",
      request.id,
      "OK, S3 works. Use bucket xyz.",
    );
    mockServer.push(toSSEEvent(neg2));
    await waitFor(300);

    // 4. Client ready
    const ready = createCapabilityReady(
      "client",
      request.id,
      "/storage/s3",
      { bucket: "xyz" },
    );
    await fetch(`${serverUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: encode(ready),
    });
    await waitFor(300);

    // 5. Data flow
    const data = createDataMessage("server", "/storage/s3", {
      file: "test.txt",
    });
    mockServer.push(toSSEEvent(data));
    await waitFor(300);

    // Verify the full flow happened
    const types = received.map((m) => m.type);
    expect(types).toContain("capability-request");
    expect(types).toContain("negotiate");
    expect(types).toContain("capability-ready");
    expect(types).toContain("data");
  });

  it("request 超时（无 ready/negotiate）可被检测", async () => {
    const request = createCapabilityRequest("server", "need compute");
    mockServer.push(toSSEEvent(request));
    await waitFor(300);

    expect(received).toHaveLength(1);

    // Simulate timeout detection (in real system, daemon would track this)
    const requestTime = received[0].timestamp;
    const elapsed = Date.now() - requestTime;

    // We can detect that no ready/negotiate has come
    const hasResponse = received.some(
      (m) =>
        (m.type === "capability-ready" || m.type === "negotiate") &&
        "ref" in m &&
        m.ref === request.id,
    );
    expect(hasResponse).toBe(false);
  });
});

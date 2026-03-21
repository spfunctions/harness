import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SSEClient } from "../../../src/client/sse-client.js";
import { MockSSEServer } from "../../helpers/mock-sse-server.js";
import { toSSEEvent, encode } from "../../../src/protocol/codec.js";
import { makeDataMessage, makeCapabilityRequest } from "../../helpers/fixtures.js";
import type { Message } from "../../../src/shared/types.js";

let mockServer: MockSSEServer;
let serverUrl: string;
let serverPort: number;

beforeEach(async () => {
  mockServer = new MockSSEServer();
  const info = await mockServer.start();
  serverUrl = info.url;
  serverPort = info.port;
});

afterEach(async () => {
  await mockServer.stop();
});

function createClient(overrides?: Partial<{
  onMessage: (msg: Message) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  reconnectInterval: number;
}>): SSEClient {
  return new SSEClient({
    url: `${serverUrl}/sse`,
    token: "test-token",
    onMessage: overrides?.onMessage ?? (() => {}),
    onConnect: overrides?.onConnect ?? (() => {}),
    onDisconnect: overrides?.onDisconnect ?? (() => {}),
    reconnectInterval: overrides?.reconnectInterval ?? 200,
    maxReconnectInterval: 1000,
  });
}

function waitFor(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("SSEClient", () => {
  it("成功连接后调 onConnect", async () => {
    let connected = false;
    const client = createClient({ onConnect: () => { connected = true; } });
    client.connect();
    await waitFor(500);
    expect(connected).toBe(true);
    client.disconnect();
  });

  it("收到消息后调 onMessage 并传入解码后的 Message", async () => {
    const received: Message[] = [];
    const client = createClient({ onMessage: (msg) => received.push(msg) });
    client.connect();
    await waitFor(500);

    const msg = makeDataMessage();
    mockServer.push(toSSEEvent(msg));
    await waitFor(300);

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("data");
    expect((received[0] as typeof msg).channel).toBe(msg.channel);
    client.disconnect();
  });

  it("server 推送无效消息时不断连，仅 log warning", async () => {
    let disconnected = false;
    const client = createClient({
      onDisconnect: () => { disconnected = true; },
    });
    client.connect();
    await waitFor(500);

    // Push an invalid event — it's text/event-stream formatted but bad JSON
    mockServer.push({
      id: "bad-1",
      event: "data",
      data: "not valid json",
    });
    await waitFor(300);

    expect(disconnected).toBe(false);
    expect(client.isConnected()).toBe(true);
    client.disconnect();
  });

  it("disconnect() 后不再重连", async () => {
    let connectCount = 0;
    const client = createClient({
      onConnect: () => { connectCount++; },
      reconnectInterval: 100,
    });
    client.connect();
    await waitFor(500);
    expect(connectCount).toBe(1);
    client.disconnect();

    // Simulate server going away and wait
    await waitFor(500);
    expect(connectCount).toBe(1);
  });

  it("server 断线后自动重连", async () => {
    let connectCount = 0;
    const client = createClient({
      onConnect: () => { connectCount++; },
      reconnectInterval: 200,
    });
    client.connect();
    await waitFor(500);
    expect(connectCount).toBe(1);

    // Disconnect all SSE connections on server side
    mockServer.disconnectAll();
    await waitFor(1000);

    expect(connectCount).toBeGreaterThanOrEqual(2);
    client.disconnect();
  });

  it("断线时调 onDisconnect", async () => {
    let disconnected = false;
    const client = createClient({
      onDisconnect: () => { disconnected = true; },
    });
    client.connect();
    await waitFor(500);

    mockServer.disconnectAll();
    await waitFor(500);
    expect(disconnected).toBe(true);
    client.disconnect();
  });

  it("重连时传 Last-Event-ID", async () => {
    const received: Message[] = [];
    const client = createClient({
      onMessage: (msg) => received.push(msg),
      reconnectInterval: 200,
    });
    client.connect();
    await waitFor(500);

    // Push a message so we have a lastEventId
    const msg1 = makeDataMessage({ id: "evt-001" });
    mockServer.push(toSSEEvent(msg1));
    await waitFor(300);
    expect(client.getLastEventId()).toBe("evt-001");

    // Push another message, disconnect, reconnect
    const msg2 = makeCapabilityRequest({ id: "evt-002" });
    mockServer.push(toSSEEvent(msg2));
    await waitFor(200);

    // After reconnect, the server should replay from evt-001
    mockServer.disconnectAll();
    await waitFor(1000);

    // Client should have received messages
    expect(received.length).toBeGreaterThanOrEqual(2);
    client.disconnect();
  });
});

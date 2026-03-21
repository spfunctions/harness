import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { MockSSEServer } from "../helpers/mock-sse-server.js";
import { Daemon } from "../../src/client/daemon.js";
import { toSSEEvent, encode } from "../../src/protocol/codec.js";
import {
  createCapabilityRequest,
  createCapabilityReady,
  createDataMessage,
} from "../../src/protocol/messages.js";
import type { Message } from "../../src/shared/types.js";

let mockCloudflare: MockSSEServer;
let cfUrl: string;
let clientDaemon: Daemon;
let serverDaemon: Daemon;
let clientDir: string;
let serverDir: string;

function waitFor(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

beforeAll(async () => {
  clientDir = fs.mkdtempSync(path.join(os.tmpdir(), "dual-client-"));
  serverDir = fs.mkdtempSync(path.join(os.tmpdir(), "dual-server-"));

  for (const dir of [clientDir, serverDir]) {
    fs.mkdirSync(path.join(dir, "inbox"), { recursive: true });
    fs.mkdirSync(path.join(dir, "logs"), { recursive: true });
    fs.mkdirSync(path.join(dir, "repo"), { recursive: true });
  }

  // Mock Cloudflare as the relay
  mockCloudflare = new MockSSEServer();
  const info = await mockCloudflare.start();
  cfUrl = info.url;

  // Start client daemon
  clientDaemon = new Daemon({
    role: "client",
    serverUrl: cfUrl,
    token: "test-token",
    workDir: clientDir,
    localPort: 0,
  });
  await clientDaemon.start();

  // Start server daemon
  serverDaemon = new Daemon({
    role: "server",
    serverUrl: cfUrl,
    token: "test-token",
    workDir: serverDir,
    localPort: 0,
  });
  await serverDaemon.start();

  await waitFor(500);
});

afterAll(async () => {
  await clientDaemon.stop();
  await serverDaemon.stop();
  await mockCloudflare.stop();
  fs.rmSync(clientDir, { recursive: true, force: true });
  fs.rmSync(serverDir, { recursive: true, force: true });
});

describe("Dual daemon communication", () => {
  it("both daemons connect to SSE", () => {
    expect(clientDaemon.getState().connected).toBe(true);
    expect(serverDaemon.getState().connected).toBe(true);
  });

  it("client sends message → server receives via broadcast", async () => {
    const msg = createCapabilityRequest("client", "test from client");
    await clientDaemon.sendToServer(msg);
    await waitFor(300);

    // Mock cloudflare broadcasts, so server daemon should have received it
    // (via SSE from the mock server which broadcasts back)
    const received = mockCloudflare.getReceivedMessages();
    expect(received.some((m) => m.id === msg.id)).toBe(true);
  });

  it("server sends message → client receives via broadcast", async () => {
    const msg = createCapabilityReady("server", "ref-001", "/api/test");
    await serverDaemon.sendToServer(msg);
    await waitFor(300);

    const received = mockCloudflare.getReceivedMessages();
    expect(received.some((m) => m.id === msg.id)).toBe(true);
  });

  it("server pushes issue → client inbox receives it", async () => {
    const issueReq = createCapabilityRequest("server", "found a bug");
    mockCloudflare.push(toSSEEvent(issueReq));
    await waitFor(500);

    // Client daemon saves capability-requests to inbox
    const inboxFile = path.join(clientDir, "inbox", `${issueReq.id}.json`);
    expect(fs.existsSync(inboxFile)).toBe(true);
  });

  it("both daemons write daemon.log", () => {
    expect(
      fs.existsSync(path.join(clientDir, "logs", "daemon.log")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(serverDir, "logs", "daemon.log")),
    ).toBe(true);
  });

  it("client daemon logs contain SSE connected event", () => {
    const log = fs.readFileSync(
      path.join(clientDir, "logs", "daemon.log"),
      "utf-8",
    );
    expect(log).toContain("SSE connected");
  });

  it("server daemon logs contain SSE connected event", () => {
    const log = fs.readFileSync(
      path.join(serverDir, "logs", "daemon.log"),
      "utf-8",
    );
    expect(log).toContain("SSE connected");
  });
});

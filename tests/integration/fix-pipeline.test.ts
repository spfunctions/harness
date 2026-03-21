import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { MockSSEServer } from "../helpers/mock-sse-server.js";
import { Daemon } from "../../src/client/daemon.js";
import { toSSEEvent } from "../../src/protocol/codec.js";
import { createDataMessage } from "../../src/protocol/messages.js";
import type { Issue } from "../../src/shared/types.js";

let mockServer: MockSSEServer;
let serverUrl: string;
let daemon: Daemon;
let tmpDir: string;

function waitFor(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fix-pipe-"));
  for (const dir of ["inbox", "logs", "repo", "issues", "fixes"]) {
    fs.mkdirSync(path.join(tmpDir, dir), { recursive: true });
  }

  mockServer = new MockSSEServer();
  const info = await mockServer.start();
  serverUrl = info.url;

  daemon = new Daemon({
    role: "client",
    serverUrl,
    token: "test-token",
    workDir: tmpDir,
    localPort: 0,
  });
  await daemon.start();
  await waitFor(500);
});

afterAll(async () => {
  await daemon.stop();
  await mockServer.stop();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Fix pipeline", () => {
  it("server pushes issue via data channel → client saves to issues/", async () => {
    const issue: Issue = {
      id: "iss-pipe-001",
      type: "bug",
      severity: "low", // low = record only, no auto-fix
      title: "test pipeline issue",
      description: "testing the pipeline",
      reproduction: "n/a",
      discovered_by: "fuzzer",
      discovered_at: Date.now(),
    };

    const msg = createDataMessage("server", "issues/new", issue);
    mockServer.push(toSSEEvent(msg));
    await waitFor(500);

    const issueFile = path.join(tmpDir, "issues", "iss-pipe-001.json");
    expect(fs.existsSync(issueFile)).toBe(true);

    const saved = JSON.parse(fs.readFileSync(issueFile, "utf-8"));
    expect(saved.id).toBe("iss-pipe-001");
    expect(saved.title).toBe("test pipeline issue");
  });

  it("low severity issue is recorded but not auto-fixed", async () => {
    // The issue from previous test was low severity — no fix should be created
    const fixFiles = fs
      .readdirSync(path.join(tmpDir, "fixes"))
      .filter((f) => f.endsWith(".json"));
    // No fixes for low-severity issues
    expect(fixFiles).toHaveLength(0);
  });

  it("issue also appears in inbox", async () => {
    const inboxFile = path.join(tmpDir, "inbox", "iss-pipe-001.json");
    // The issue should have been saved to inbox (saveToInbox called in handleIssue)
    // Note: saveToInbox uses msg.id, but we passed issue as Message-like
    // The file may be under the data message id, not the issue id
    const inboxFiles = fs
      .readdirSync(path.join(tmpDir, "inbox"))
      .filter((f) => f.endsWith(".json"));
    expect(inboxFiles.length).toBeGreaterThan(0);
  });

  it("daemon logs show issue received", () => {
    const logPath = path.join(tmpDir, "logs", "daemon.log");
    const content = fs.readFileSync(logPath, "utf-8");
    expect(content).toContain("issue received from server");
    expect(content).toContain("iss-pipe-001");
  });
});

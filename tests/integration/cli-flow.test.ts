import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { setFormat } from "../../src/cli/output.js";

let tmpHome: string;
let origHome: string;
let origStdout: typeof process.stdout.write;
let captured: string;

function captureStdout(): void {
  captured = "";
  origStdout = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    captured += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    return true;
  }) as typeof process.stdout.write;
}

function restoreStdout(): string {
  process.stdout.write = origStdout;
  return captured;
}

function setupSparkcoDir(): string {
  const sparkcoDir = path.join(tmpHome, ".sparkco");
  for (const dir of [
    "",
    "inbox",
    "logs",
    "manifests",
    "credentials",
    "repo",
  ]) {
    fs.mkdirSync(path.join(sparkcoDir, dir), { recursive: true });
  }

  const config = {
    version: "1",
    server: {
      workerName: "sparkco-harness",
      workerUrl: "https://sparkco-harness.test.workers.dev",
      accountId: "test-account",
      kvNamespaceId: "test-kv",
    },
    client: { port: 3847, routes: [] },
    session: {
      token: "test-token-very-long-nanoid-32ch",
      createdAt: Date.now(),
    },
    pi: { skillInstalled: false, target: "both" },
    daemon: {
      autoStart: true,
      stateSyncInterval: 60000,
      logRetentionDays: 7,
    },
  };
  fs.writeFileSync(
    path.join(sparkcoDir, "config.json"),
    JSON.stringify(config, null, 2),
  );
  return sparkcoDir;
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "cli-flow-"));
  origHome = process.env.HOME!;
  process.env.HOME = tmpHome;
});

afterEach(() => {
  process.env.HOME = origHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
  setFormat("human");
});

describe("CLI Flow", () => {
  it("sparkco status outputs correct state", async () => {
    setupSparkcoDir();
    const { statusCommand } = await import(
      "../../src/cli/commands/status.js"
    );
    captureStdout();
    await statusCommand();
    const out = restoreStdout();
    expect(out).toContain("SparkCo");
    expect(out).toContain("sparkco-harness");
  });

  it("sparkco routes add → routes list shows new route", async () => {
    setupSparkcoDir();
    const { routesCommand } = await import(
      "../../src/cli/commands/routes.js"
    );

    captureStdout();
    await routesCommand("add", "/webhooks/test");
    let out = restoreStdout();
    expect(out).toContain("Added");

    captureStdout();
    await routesCommand("list");
    out = restoreStdout();
    expect(out).toContain("/webhooks/test");
  });

  it("sparkco manifest show → history → rollback flow", async () => {
    const sparkcoDir = setupSparkcoDir();

    // Create some manifests
    for (let i = 1; i <= 3; i++) {
      const v = `v${String(i).padStart(3, "0")}`;
      fs.writeFileSync(
        path.join(sparkcoDir, "manifests", `${v}.json`),
        JSON.stringify({
          version: v,
          timestamp: Date.now() + i * 1000,
          server: { commit: `s${i}`, processes: [] },
          client: { commit: `c${i}`, processes: [] },
          ...(i > 1 ? { rollback_to: `v${String(i - 1).padStart(3, "0")}` } : {}),
        }),
      );
    }

    const { manifestCommand } = await import(
      "../../src/cli/commands/manifest.js"
    );

    // Show current
    captureStdout();
    await manifestCommand("show");
    let out = restoreStdout();
    expect(out).toContain("v003");

    // History
    captureStdout();
    await manifestCommand("history");
    out = restoreStdout();
    expect(out).toContain("v001");
    expect(out).toContain("v002");
    expect(out).toContain("v003");

    // Rollback
    captureStdout();
    await manifestCommand("rollback", "v001");
    out = restoreStdout();
    expect(out).toContain("Rolled back");
  });

  it("sparkco inbox lifecycle: add → list → view → clear", async () => {
    const sparkcoDir = setupSparkcoDir();
    const { inboxCommand } = await import(
      "../../src/cli/commands/inbox.js"
    );

    // Add an item
    const msg = {
      type: "capability-request",
      id: "flow-req-001",
      from: "server",
      description: "need webhook",
      timestamp: Date.now(),
    };
    fs.writeFileSync(
      path.join(sparkcoDir, "inbox", "flow-req-001.json"),
      JSON.stringify(msg),
    );

    // List
    captureStdout();
    await inboxCommand("list");
    let out = restoreStdout();
    expect(out).toContain("flow-req-001");

    // View
    captureStdout();
    await inboxCommand("view", "flow-req-001");
    out = restoreStdout();
    expect(out).toContain("need webhook");

    // Clear
    captureStdout();
    await inboxCommand("clear");
    out = restoreStdout();
    expect(out).toContain("Cleared");

    // Verify empty
    const remaining = fs
      .readdirSync(path.join(sparkcoDir, "inbox"))
      .filter((f) => f.endsWith(".json"));
    expect(remaining).toHaveLength(0);
  });

  it("sparkco destroy --force cleans up", async () => {
    const sparkcoDir = setupSparkcoDir();
    const { destroyCommand } = await import(
      "../../src/cli/commands/destroy.js"
    );

    captureStdout();
    await destroyCommand({ force: true });
    const out = restoreStdout();
    expect(out).toContain("complete");

    expect(fs.existsSync(sparkcoDir)).toBe(false);
  });
});

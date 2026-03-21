import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { setFormat, getFormat } from "../../../src/cli/output.js";

// We test CLI commands by setting up a temp ~/.sparkco and capturing stdout
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
  fs.mkdirSync(path.join(sparkcoDir, "inbox"), { recursive: true });
  fs.mkdirSync(path.join(sparkcoDir, "logs"), { recursive: true });
  fs.mkdirSync(path.join(sparkcoDir, "manifests"), { recursive: true });
  fs.mkdirSync(path.join(sparkcoDir, "credentials"), { recursive: true });
  fs.mkdirSync(path.join(sparkcoDir, "repo"), { recursive: true });

  const config = {
    version: "1",
    server: {
      workerName: "sparkco-harness",
      workerUrl: "https://sparkco-harness.test.workers.dev",
      accountId: "test-account-id",
      kvNamespaceId: "test-kv-id",
    },
    client: { port: 3847, routes: ["/signals/test"] },
    session: { token: "test-token-32-chars-long-enough!", createdAt: Date.now() },
    pi: { skillInstalled: false, target: "both" },
    daemon: { autoStart: true, stateSyncInterval: 60000, logRetentionDays: 7 },
  };
  fs.writeFileSync(
    path.join(sparkcoDir, "config.json"),
    JSON.stringify(config, null, 2),
  );
  return sparkcoDir;
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "sparkco-test-"));
  origHome = process.env.HOME!;
  process.env.HOME = tmpHome;
});

afterEach(() => {
  process.env.HOME = origHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
  setFormat("human");
});

describe("sparkco status", () => {
  it("outputs status when config exists", async () => {
    setupSparkcoDir();
    // Re-import to pick up new HOME
    const { statusCommand } = await import(
      "../../../src/cli/commands/status.js"
    );
    captureStdout();
    await statusCommand();
    const out = restoreStdout();
    expect(out).toContain("SparkCo");
  });

  it("--json outputs valid JSON", async () => {
    setupSparkcoDir();
    setFormat("json");
    const { statusCommand } = await import(
      "../../../src/cli/commands/status.js"
    );
    captureStdout();
    await statusCommand();
    const out = restoreStdout();
    const parsed = JSON.parse(out.trim());
    expect(parsed).toHaveProperty("daemon");
    expect(parsed).toHaveProperty("server");
  });

  it("error when not initialized", async () => {
    const { statusCommand } = await import(
      "../../../src/cli/commands/status.js"
    );
    captureStdout();
    await statusCommand();
    const out = restoreStdout();
    expect(out).toContain("init");
  });
});

describe("sparkco inbox", () => {
  it("list shows 'No pending' when empty", async () => {
    setupSparkcoDir();
    const { inboxCommand } = await import(
      "../../../src/cli/commands/inbox.js"
    );
    captureStdout();
    await inboxCommand("list");
    const out = restoreStdout();
    expect(out).toContain("No pending");
  });

  it("list shows items when inbox has files", async () => {
    const sparkcoDir = setupSparkcoDir();
    fs.writeFileSync(
      path.join(sparkcoDir, "inbox", "req-001.json"),
      JSON.stringify({
        type: "capability-request",
        id: "req-001",
        from: "server",
        description: "need storage",
        timestamp: Date.now(),
      }),
    );
    const { inboxCommand } = await import(
      "../../../src/cli/commands/inbox.js"
    );
    captureStdout();
    await inboxCommand("list");
    const out = restoreStdout();
    expect(out).toContain("req-001");
    expect(out).toContain("need storage");
  });

  it("view shows full message JSON", async () => {
    const sparkcoDir = setupSparkcoDir();
    const msg = {
      type: "capability-request",
      id: "req-002",
      from: "server",
      description: "test",
      timestamp: 1700000000000,
    };
    fs.writeFileSync(
      path.join(sparkcoDir, "inbox", "req-002.json"),
      JSON.stringify(msg),
    );
    const { inboxCommand } = await import(
      "../../../src/cli/commands/inbox.js"
    );
    captureStdout();
    await inboxCommand("view", "req-002");
    const out = restoreStdout();
    expect(out).toContain("req-002");
    expect(out).toContain("capability-request");
  });

  it("view non-existent id shows error", async () => {
    setupSparkcoDir();
    const { inboxCommand } = await import(
      "../../../src/cli/commands/inbox.js"
    );
    captureStdout();
    await inboxCommand("view", "nonexistent");
    const out = restoreStdout();
    expect(out).toContain("not found");
  });

  it("clear removes all inbox files", async () => {
    const sparkcoDir = setupSparkcoDir();
    fs.writeFileSync(
      path.join(sparkcoDir, "inbox", "req-003.json"),
      "{}",
    );
    const { inboxCommand } = await import(
      "../../../src/cli/commands/inbox.js"
    );
    captureStdout();
    await inboxCommand("clear");
    restoreStdout();
    const remaining = fs.readdirSync(path.join(sparkcoDir, "inbox"));
    expect(remaining).toHaveLength(0);
  });
});

describe("sparkco routes", () => {
  it("list shows current routes", async () => {
    setupSparkcoDir();
    const { routesCommand } = await import(
      "../../../src/cli/commands/routes.js"
    );
    captureStdout();
    await routesCommand("list");
    const out = restoreStdout();
    expect(out).toContain("/signals/test");
  });

  it("add adds a route and persists to config", async () => {
    const sparkcoDir = setupSparkcoDir();
    const { routesCommand } = await import(
      "../../../src/cli/commands/routes.js"
    );
    captureStdout();
    await routesCommand("add", "/webhooks/github");
    restoreStdout();

    const config = JSON.parse(
      fs.readFileSync(
        path.join(sparkcoDir, "config.json"),
        "utf-8",
      ),
    );
    expect(config.client.routes).toContain("/webhooks/github");
  });

  it("add duplicate route shows error", async () => {
    setupSparkcoDir();
    const { routesCommand } = await import(
      "../../../src/cli/commands/routes.js"
    );
    captureStdout();
    await routesCommand("add", "/signals/test");
    const out = restoreStdout();
    expect(out).toContain("already exists");
  });

  it("remove deletes route and updates config", async () => {
    const sparkcoDir = setupSparkcoDir();
    const { routesCommand } = await import(
      "../../../src/cli/commands/routes.js"
    );
    captureStdout();
    await routesCommand("remove", "/signals/test");
    restoreStdout();

    const config = JSON.parse(
      fs.readFileSync(
        path.join(sparkcoDir, "config.json"),
        "utf-8",
      ),
    );
    expect(config.client.routes).not.toContain("/signals/test");
  });

  it("remove non-existent route shows error", async () => {
    setupSparkcoDir();
    const { routesCommand } = await import(
      "../../../src/cli/commands/routes.js"
    );
    captureStdout();
    await routesCommand("remove", "/nonexistent");
    const out = restoreStdout();
    expect(out).toContain("not found");
  });
});

describe("sparkco manifest", () => {
  it("show outputs 'No manifest' when none exists", async () => {
    setupSparkcoDir();
    const { manifestCommand } = await import(
      "../../../src/cli/commands/manifest.js"
    );
    captureStdout();
    await manifestCommand("show");
    const out = restoreStdout();
    expect(out).toContain("No manifest");
  });

  it("show outputs manifest when one exists", async () => {
    const sparkcoDir = setupSparkcoDir();
    const manifest = {
      version: "v001",
      timestamp: Date.now(),
      server: { commit: "abc", processes: [] },
      client: { commit: "def", processes: [] },
    };
    fs.writeFileSync(
      path.join(sparkcoDir, "manifests", "v001.json"),
      JSON.stringify(manifest),
    );
    const { manifestCommand } = await import(
      "../../../src/cli/commands/manifest.js"
    );
    captureStdout();
    await manifestCommand("show");
    const out = restoreStdout();
    expect(out).toContain("v001");
  });

  it("history outputs version list", async () => {
    const sparkcoDir = setupSparkcoDir();
    for (const v of ["v001", "v002"]) {
      fs.writeFileSync(
        path.join(sparkcoDir, "manifests", `${v}.json`),
        JSON.stringify({
          version: v,
          timestamp: Date.now(),
          server: { commit: "a", processes: [] },
          client: { commit: "b", processes: [] },
        }),
      );
    }
    const { manifestCommand } = await import(
      "../../../src/cli/commands/manifest.js"
    );
    captureStdout();
    await manifestCommand("history");
    const out = restoreStdout();
    expect(out).toContain("v001");
    expect(out).toContain("v002");
  });

  it("rollback to existing version succeeds", async () => {
    const sparkcoDir = setupSparkcoDir();
    for (const v of ["v001", "v002"]) {
      fs.writeFileSync(
        path.join(sparkcoDir, "manifests", `${v}.json`),
        JSON.stringify({
          version: v,
          timestamp: Date.now(),
          server: { commit: `s-${v}`, processes: [] },
          client: { commit: `c-${v}`, processes: [] },
        }),
      );
    }
    const { manifestCommand } = await import(
      "../../../src/cli/commands/manifest.js"
    );
    captureStdout();
    await manifestCommand("rollback", "v001");
    const out = restoreStdout();
    expect(out).toContain("Rolled back");
    // New manifest file should exist
    const files = fs.readdirSync(
      path.join(sparkcoDir, "manifests"),
    );
    expect(files).toContain("v003.json");
  });

  it("rollback to non-existent version shows error", async () => {
    setupSparkcoDir();
    const { manifestCommand } = await import(
      "../../../src/cli/commands/manifest.js"
    );
    captureStdout();
    await manifestCommand("rollback", "v999");
    const out = restoreStdout();
    expect(out).toContain("not found");
  });
});

describe("sparkco logs", () => {
  it("lists available log files", async () => {
    const sparkcoDir = setupSparkcoDir();
    fs.writeFileSync(
      path.join(sparkcoDir, "logs", "worker.log"),
      "line1\nline2\n",
    );
    const { logsCommand } = await import(
      "../../../src/cli/commands/logs.js"
    );
    captureStdout();
    await logsCommand();
    const out = restoreStdout();
    expect(out).toContain("worker");
  });

  it("shows last N lines of a log", async () => {
    const sparkcoDir = setupSparkcoDir();
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    fs.writeFileSync(
      path.join(sparkcoDir, "logs", "test.log"),
      lines.join("\n"),
    );
    const { logsCommand } = await import(
      "../../../src/cli/commands/logs.js"
    );
    captureStdout();
    await logsCommand("test", { lines: 5 });
    const out = restoreStdout();
    expect(out).toContain("line 99");
    expect(out).not.toContain("line 0");
  });

  it("error for non-existent log", async () => {
    setupSparkcoDir();
    const { logsCommand } = await import(
      "../../../src/cli/commands/logs.js"
    );
    captureStdout();
    await logsCommand("nonexistent");
    const out = restoreStdout();
    expect(out).toContain("not found");
  });
});

describe("sparkco deploy", () => {
  it("--status when not deployed", async () => {
    setupSparkcoDir();
    const { deployCommand } = await import(
      "../../../src/cli/commands/deploy.js"
    );
    captureStdout();
    await deployCommand({ status: true });
    const out = restoreStdout();
    expect(out).toContain("Not deployed");
  });

  it("--status when deploy.json exists", async () => {
    const sparkcoDir = setupSparkcoDir();
    fs.writeFileSync(
      path.join(sparkcoDir, "deploy.json"),
      JSON.stringify({
        url: "https://test.workers.dev",
        deployedAt: Date.now(),
        workerName: "sparkco-harness",
      }),
    );
    const { deployCommand } = await import(
      "../../../src/cli/commands/deploy.js"
    );
    captureStdout();
    await deployCommand({ status: true });
    const out = restoreStdout();
    expect(out).toContain("test.workers.dev");
  });
});

describe("sparkco daemon", () => {
  it("stop when not running shows error", async () => {
    setupSparkcoDir();
    const { daemonCommand } = await import(
      "../../../src/cli/commands/daemon-cmd.js"
    );
    captureStdout();
    await daemonCommand("stop");
    const out = restoreStdout();
    expect(out).toContain("not running");
  });
});

describe("sparkco secret", () => {
  it("get non-existent secret shows error", async () => {
    setupSparkcoDir();
    const { secretCommand } = await import(
      "../../../src/cli/commands/secret.js"
    );
    captureStdout();
    await secretCommand("get", "NONEXISTENT");
    const out = restoreStdout();
    expect(out).toContain("not found");
  });

  it("set without name shows error", async () => {
    setupSparkcoDir();
    const { secretCommand } = await import(
      "../../../src/cli/commands/secret.js"
    );
    captureStdout();
    await secretCommand("set");
    const out = restoreStdout();
    expect(out).toContain("Usage");
  });
});

describe("sparkco destroy token handling", () => {
  it("no token warns but local cleanup proceeds", async () => {
    const sparkcoDir = setupSparkcoDir();
    const origToken = process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_API_TOKEN;
    try {
      const { destroyCommand } = await import(
        "../../../src/cli/commands/destroy.js"
      );
      captureStdout();
      await destroyCommand({ force: true });
      const out = restoreStdout();
      // Should warn about missing token
      expect(out).toContain("No API token");
      // But still complete local cleanup
      expect(out).toContain("complete");
      expect(fs.existsSync(sparkcoDir)).toBe(false);
    } finally {
      if (origToken) process.env.CLOUDFLARE_API_TOKEN = origToken;
    }
  });

  it("reads apiToken from config.json", async () => {
    const sparkcoDir = setupSparkcoDir();
    // Add apiToken to the config
    const configPath = path.join(sparkcoDir, "config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    config.server.apiToken = "stored-cf-token";
    fs.writeFileSync(configPath, JSON.stringify(config));

    const origToken = process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_API_TOKEN;
    try {
      const { destroyCommand } = await import(
        "../../../src/cli/commands/destroy.js"
      );
      captureStdout();
      await destroyCommand({ force: true });
      const out = restoreStdout();
      // Should NOT warn about missing token (has config token)
      expect(out).not.toContain("No API token");
      expect(out).toContain("complete");
    } finally {
      if (origToken) process.env.CLOUDFLARE_API_TOKEN = origToken;
    }
  });
});

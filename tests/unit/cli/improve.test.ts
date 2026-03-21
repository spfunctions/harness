import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { setFormat } from "../../../src/cli/output.js";

let tmpHome: string;
let origHome: string;
let origStdout: typeof process.stdout.write;
let captured: string;

function captureStdout(): void {
  captured = "";
  origStdout = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    captured +=
      typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    return true;
  }) as typeof process.stdout.write;
}

function restoreStdout(): string {
  process.stdout.write = origStdout;
  return captured;
}

function setupSparkcoDir(): string {
  const sparkcoDir = path.join(tmpHome, ".sparkco");
  for (const dir of ["", "inbox", "logs", "manifests", "issues", "fixes"]) {
    fs.mkdirSync(path.join(sparkcoDir, dir), { recursive: true });
  }
  const config = {
    version: "1",
    server: {
      workerName: "sparkco-harness",
      workerUrl: "https://test.workers.dev",
      accountId: "test",
      kvNamespaceId: "test",
    },
    client: { port: 3847, routes: [] },
    session: { token: "test-token", createdAt: Date.now() },
    pi: { skillInstalled: false, target: "both" },
    daemon: { autoStart: true, stateSyncInterval: 60000, logRetentionDays: 7 },
  };
  fs.writeFileSync(
    path.join(sparkcoDir, "config.json"),
    JSON.stringify(config),
  );
  return sparkcoDir;
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "improve-test-"));
  origHome = process.env.HOME!;
  process.env.HOME = tmpHome;
});

afterEach(() => {
  process.env.HOME = origHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
  setFormat("human");
});

describe("sparkco improve status", () => {
  it("shows dashboard with zero state", async () => {
    setupSparkcoDir();
    const { improveCommand } = await import(
      "../../../src/cli/commands/improve.js"
    );
    captureStdout();
    await improveCommand("status");
    const out = restoreStdout();
    expect(out).toContain("Self-Improvement");
    expect(out).toContain("paused");
  });

  it("--json outputs valid JSON", async () => {
    setupSparkcoDir();
    setFormat("json");
    const { improveCommand } = await import(
      "../../../src/cli/commands/improve.js"
    );
    captureStdout();
    await improveCommand("status");
    const out = restoreStdout();
    const parsed = JSON.parse(out.trim());
    expect(parsed).toHaveProperty("health");
    expect(parsed).toHaveProperty("cycle");
  });
});

describe("sparkco improve issues", () => {
  it("shows 'No issues' when empty", async () => {
    setupSparkcoDir();
    const { improveCommand } = await import(
      "../../../src/cli/commands/improve.js"
    );
    captureStdout();
    await improveCommand("issues");
    const out = restoreStdout();
    expect(out).toContain("No issues");
  });

  it("lists issues when present", async () => {
    const sparkcoDir = setupSparkcoDir();
    fs.writeFileSync(
      path.join(sparkcoDir, "issues", "iss-001.json"),
      JSON.stringify({
        id: "iss-001",
        type: "bug",
        severity: "high",
        title: "test issue",
        description: "desc",
        reproduction: "repro",
        discovered_by: "fuzzer",
        discovered_at: Date.now(),
      }),
    );
    const { improveCommand } = await import(
      "../../../src/cli/commands/improve.js"
    );
    captureStdout();
    await improveCommand("issues");
    const out = restoreStdout();
    expect(out).toContain("iss-001");
    expect(out).toContain("test issue");
  });
});

describe("sparkco improve issue <id>", () => {
  it("shows full issue detail", async () => {
    const sparkcoDir = setupSparkcoDir();
    fs.writeFileSync(
      path.join(sparkcoDir, "issues", "iss-002.json"),
      JSON.stringify({
        id: "iss-002",
        type: "edge-case",
        severity: "medium",
        title: "edge case issue",
        description: "detailed description",
        reproduction: "do X then Y",
        discovered_by: "code-review",
        discovered_at: Date.now(),
      }),
    );
    const { improveCommand } = await import(
      "../../../src/cli/commands/improve.js"
    );
    captureStdout();
    await improveCommand("issue", "iss-002");
    const out = restoreStdout();
    expect(out).toContain("iss-002");
    expect(out).toContain("detailed description");
  });

  it("error for missing id", async () => {
    setupSparkcoDir();
    const { improveCommand } = await import(
      "../../../src/cli/commands/improve.js"
    );
    captureStdout();
    await improveCommand("issue");
    const out = restoreStdout();
    expect(out).toContain("Usage");
  });
});

describe("sparkco improve pause/resume", () => {
  it("pause sets health to paused", async () => {
    const sparkcoDir = setupSparkcoDir();
    const { improveCommand } = await import(
      "../../../src/cli/commands/improve.js"
    );
    captureStdout();
    await improveCommand("pause");
    const out = restoreStdout();
    expect(out).toContain("paused");

    const dashboard = JSON.parse(
      fs.readFileSync(
        path.join(sparkcoDir, "improve-dashboard.json"),
        "utf-8",
      ),
    );
    expect(dashboard.health).toBe("paused");
  });

  it("resume sets health to running", async () => {
    const sparkcoDir = setupSparkcoDir();
    const { improveCommand } = await import(
      "../../../src/cli/commands/improve.js"
    );
    captureStdout();
    await improveCommand("resume");
    const out = restoreStdout();
    expect(out).toContain("resumed");

    const dashboard = JSON.parse(
      fs.readFileSync(
        path.join(sparkcoDir, "improve-dashboard.json"),
        "utf-8",
      ),
    );
    expect(dashboard.health).toBe("running");
  });
});

describe("sparkco improve config", () => {
  it("shows current safety limits", async () => {
    setupSparkcoDir();
    const { improveCommand } = await import(
      "../../../src/cli/commands/improve.js"
    );
    captureStdout();
    await improveCommand("config");
    const out = restoreStdout();
    expect(out).toContain("Max issues/hour");
    expect(out).toContain("10");
  });
});

describe("sparkco improve fixes", () => {
  it("shows 'No fixes' when empty", async () => {
    setupSparkcoDir();
    const { improveCommand } = await import(
      "../../../src/cli/commands/improve.js"
    );
    captureStdout();
    await improveCommand("fixes");
    const out = restoreStdout();
    expect(out).toContain("No fixes");
  });
});

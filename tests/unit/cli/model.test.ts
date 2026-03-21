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
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "model-test-"));
  origHome = process.env.HOME!;
  process.env.HOME = tmpHome;
});

afterEach(() => {
  process.env.HOME = origHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
  setFormat("human");
});

describe("sparkco model", () => {
  it("显示当前 client 和 server 模型配置", async () => {
    setupSparkcoDir();
    const { modelCommand } = await import(
      "../../../src/cli/commands/model.js"
    );
    captureStdout();
    await modelCommand();
    const out = restoreStdout();
    expect(out).toContain("not configured");
  });

  it("未配置时显示 not configured", async () => {
    setupSparkcoDir();
    setFormat("json");
    const { modelCommand } = await import(
      "../../../src/cli/commands/model.js"
    );
    captureStdout();
    await modelCommand();
    const out = restoreStdout();
    const parsed = JSON.parse(out.trim());
    expect(parsed.client).toBeNull();
  });
});

describe("sparkco model set", () => {
  it("set client 更新配置", async () => {
    const sparkcoDir = setupSparkcoDir();
    // Create a minimal pi config first
    const piDir = path.join(sparkcoDir, "pi-client", ".pi", "agent");
    fs.mkdirSync(piDir, { recursive: true });
    fs.writeFileSync(
      path.join(piDir, "settings.json"),
      JSON.stringify({
        provider: "openai",
        model: "old-model",
        apiKey: "sk-test",
        baseUrl: "https://openrouter.ai/api/v1",
      }),
    );

    const { modelCommand } = await import(
      "../../../src/cli/commands/model.js"
    );
    captureStdout();
    await modelCommand("set", "client", "anthropic/claude-sonnet-4-6");
    const out = restoreStdout();
    expect(out).toContain("updated");

    // Verify config file updated
    const config = JSON.parse(
      fs.readFileSync(
        path.join(sparkcoDir, "config.json"),
        "utf-8",
      ),
    );
    expect(config.agent.client.model).toBe(
      "anthropic/claude-sonnet-4-6",
    );
  });

  it("set both 同时更新两端", async () => {
    setupSparkcoDir();
    const { modelCommand } = await import(
      "../../../src/cli/commands/model.js"
    );
    captureStdout();
    await modelCommand("set", "both", "minimax/minimax-m2.7");
    const out = restoreStdout();
    expect(out).toContain("Client");
    expect(out).toContain("Server");
  });

  it("无效 target 报错", async () => {
    setupSparkcoDir();
    const { modelCommand } = await import(
      "../../../src/cli/commands/model.js"
    );
    captureStdout();
    await modelCommand("set", "invalid", "model-id");
    const out = restoreStdout();
    expect(out).toContain("must be");
  });
});

describe("sparkco model list", () => {
  it("输出所有预设", async () => {
    setupSparkcoDir();
    const { modelCommand } = await import(
      "../../../src/cli/commands/model.js"
    );
    captureStdout();
    await modelCommand("list");
    const out = restoreStdout();
    expect(out).toContain("minimax");
    expect(out).toContain("claude");
    expect(out).toContain("gpt");
  });

  it("--json 输出数组格式", async () => {
    setupSparkcoDir();
    setFormat("json");
    const { modelCommand } = await import(
      "../../../src/cli/commands/model.js"
    );
    captureStdout();
    await modelCommand("list");
    const out = restoreStdout();
    const parsed = JSON.parse(out.trim());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });
});

describe("sparkco model key", () => {
  it("显示 masked key 当已配置", async () => {
    const sparkcoDir = setupSparkcoDir();
    const piDir = path.join(sparkcoDir, "pi-client", ".pi", "agent");
    fs.mkdirSync(piDir, { recursive: true });
    fs.writeFileSync(
      path.join(piDir, "settings.json"),
      JSON.stringify({
        provider: "openai",
        model: "minimax/minimax-m2.7",
        apiKey: "sk-or-v1-very-long-test-key",
        baseUrl: "https://openrouter.ai/api/v1",
      }),
    );

    const { modelCommand } = await import(
      "../../../src/cli/commands/model.js"
    );
    captureStdout();
    await modelCommand("key");
    const out = restoreStdout();
    expect(out).toContain("***");
    expect(out).not.toContain("very-long-test-key");
  });

  it("未配置时提示", async () => {
    setupSparkcoDir();
    const { modelCommand } = await import(
      "../../../src/cli/commands/model.js"
    );
    captureStdout();
    await modelCommand("key");
    const out = restoreStdout();
    expect(out).toContain("No API key");
  });
});

describe("sparkco model test", () => {
  it("未配置时提示先配置", async () => {
    setupSparkcoDir();
    const { modelCommand } = await import(
      "../../../src/cli/commands/model.js"
    );
    captureStdout();
    await modelCommand("test");
    const out = restoreStdout();
    expect(out).toContain("No model configured");
  });
});

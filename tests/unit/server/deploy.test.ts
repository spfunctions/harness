import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getDeployStatus,
} from "../../../src/server/deploy.js";
import { copyServerFiles } from "../../../src/cli/wizard/cloudflare.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("getDeployStatus", () => {
  const baseConfig = {
    workerName: "test-worker",
    accountId: "test-account",
    apiToken: "test-token",
    configDir: "",
  };

  it("未部署时返回 deployed=false", async () => {
    const config = { ...baseConfig, configDir: tmpDir };
    const status = await getDeployStatus(config);
    expect(status.deployed).toBe(false);
  });

  it("已部署时返回 deployed=true + url", async () => {
    const config = { ...baseConfig, configDir: tmpDir };
    fs.writeFileSync(
      path.join(tmpDir, "deploy.json"),
      JSON.stringify({
        url: "https://test.workers.dev",
        deployedAt: 1700000000000,
        workerName: "test-worker",
      }),
    );
    const status = await getDeployStatus(config);
    expect(status.deployed).toBe(true);
    expect(status.url).toBe("https://test.workers.dev");
    expect(status.lastDeployed).toBe(1700000000000);
  });
});

describe("deployWorker (wrangler.toml generation)", () => {
  it("detects missing wrangler.toml", async () => {
    const { deployWorker } = await import(
      "../../../src/server/deploy.js"
    );
    const config = {
      workerName: "test",
      accountId: "acc",
      apiToken: "tok",
      configDir: tmpDir,
    };
    const result = await deployWorker(config);
    expect(result.success).toBe(false);
    expect(result.error).toContain("wrangler.toml not found");
  });
});

describe("copyServerFiles", () => {
  it("copies all necessary server files to configDir/server/", () => {
    copyServerFiles(tmpDir);
    const serverDir = path.join(tmpDir, "server");
    expect(fs.existsSync(serverDir)).toBe(true);
    expect(fs.existsSync(path.join(serverDir, "worker.ts"))).toBe(true);
    expect(fs.existsSync(path.join(serverDir, "durable-object.ts"))).toBe(true);
    expect(fs.existsSync(path.join(serverDir, "sse-server.ts"))).toBe(true);
    expect(fs.existsSync(path.join(serverDir, "types.ts"))).toBe(true);
    expect(fs.existsSync(path.join(serverDir, "errors.ts"))).toBe(true);
    expect(fs.existsSync(path.join(serverDir, "codec.ts"))).toBe(true);
  });

  it("wrangler.toml main path resolves relative to configDir", () => {
    copyServerFiles(tmpDir);
    // Write a wrangler.toml using the template pattern
    fs.writeFileSync(
      path.join(tmpDir, "wrangler.toml"),
      'main = "server/worker.ts"\n',
    );
    // The main entry should exist relative to configDir
    const mainPath = path.join(tmpDir, "server", "worker.ts");
    expect(fs.existsSync(mainPath)).toBe(true);
  });

  it("re-copy is idempotent", () => {
    copyServerFiles(tmpDir);
    copyServerFiles(tmpDir); // should not throw
    expect(fs.existsSync(path.join(tmpDir, "server", "worker.ts"))).toBe(true);
  });
});

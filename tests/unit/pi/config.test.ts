import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  toPiProviderConfig,
  writePiConfig,
  readPiConfig,
} from "../../../src/pi/config.js";
import type { LLMConfig } from "../../../src/shared/types.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-config-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("toPiProviderConfig", () => {
  it("openrouter → provider=openai + baseUrl=openrouter", () => {
    const result = toPiProviderConfig({
      provider: "openrouter",
      model: "minimax/minimax-m2.7",
      apiKey: "sk-test",
    });
    expect(result.provider).toBe("openai");
    expect(result.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(result.model).toBe("minimax/minimax-m2.7");
    expect(result.apiKey).toBe("sk-test");
  });

  it("anthropic → provider=anthropic，无 baseUrl", () => {
    const result = toPiProviderConfig({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
    });
    expect(result.provider).toBe("anthropic");
    expect(result.baseUrl).toBeUndefined();
  });

  it("openai → provider=openai，无 baseUrl", () => {
    const result = toPiProviderConfig({
      provider: "openai",
      model: "gpt-5",
      apiKey: "sk-test",
    });
    expect(result.provider).toBe("openai");
    expect(result.baseUrl).toBeUndefined();
  });

  it("custom → provider=openai + 自定义 baseUrl", () => {
    const result = toPiProviderConfig({
      provider: "custom",
      model: "my-model",
      apiKey: "sk-test",
      baseUrl: "https://my-llm.example.com/v1",
    });
    expect(result.provider).toBe("openai");
    expect(result.baseUrl).toBe("https://my-llm.example.com/v1");
  });
});

describe("writePiConfig", () => {
  it("client 端写入 settings.json", async () => {
    const llmConfig: LLMConfig = {
      provider: "openrouter",
      model: "minimax/minimax-m2.7",
      apiKey: "sk-test-key",
    };
    await writePiConfig("client", llmConfig, tmpDir);

    const settingsPath = path.join(
      tmpDir,
      "pi-client",
      ".pi",
      "agent",
      "settings.json",
    );
    expect(fs.existsSync(settingsPath)).toBe(true);
  });

  it("settings.json 格式正确", async () => {
    const llmConfig: LLMConfig = {
      provider: "openrouter",
      model: "minimax/minimax-m2.7",
      apiKey: "sk-test-key",
    };
    await writePiConfig("client", llmConfig, tmpDir);

    const settingsPath = path.join(
      tmpDir,
      "pi-client",
      ".pi",
      "agent",
      "settings.json",
    );
    const raw = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(raw.provider).toBe("openai");
    expect(raw.model).toBe("minimax/minimax-m2.7");
    expect(raw.apiKey).toBe("sk-test-key");
    expect(raw.baseUrl).toBe("https://openrouter.ai/api/v1");
  });

  it("目录不存在时自动创建", async () => {
    const deepDir = path.join(tmpDir, "deep", "nested");
    const llmConfig: LLMConfig = {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant",
    };
    await writePiConfig("client", llmConfig, deepDir);

    const settingsPath = path.join(
      deepDir,
      "pi-client",
      ".pi",
      "agent",
      "settings.json",
    );
    expect(fs.existsSync(settingsPath)).toBe(true);
  });
});

describe("readPiConfig", () => {
  it("returns null when no config exists", () => {
    expect(readPiConfig(tmpDir)).toBeNull();
  });

  it("reads existing config", async () => {
    await writePiConfig(
      "client",
      {
        provider: "openrouter",
        model: "minimax/minimax-m2.7",
        apiKey: "sk-test",
      },
      tmpDir,
    );
    const result = readPiConfig(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.model).toBe("minimax/minimax-m2.7");
    expect(result!.provider).toBe("openai");
  });
});

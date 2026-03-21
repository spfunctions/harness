import * as fs from "node:fs";
import * as path from "node:path";
import type { LLMConfig } from "../shared/types.js";

export type PiConfigTarget = "client" | "server";

export function toPiProviderConfig(llmConfig: LLMConfig): {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
} {
  switch (llmConfig.provider) {
    case "openrouter":
      return {
        provider: "openai",
        model: llmConfig.model,
        apiKey: llmConfig.apiKey,
        baseUrl: "https://openrouter.ai/api/v1",
      };
    case "anthropic":
      return {
        provider: "anthropic",
        model: llmConfig.model,
        apiKey: llmConfig.apiKey,
      };
    case "openai":
      return {
        provider: "openai",
        model: llmConfig.model,
        apiKey: llmConfig.apiKey,
      };
    case "custom":
      return {
        provider: "openai",
        model: llmConfig.model,
        apiKey: llmConfig.apiKey,
        baseUrl: llmConfig.baseUrl,
      };
  }
}

export async function writePiConfig(
  target: PiConfigTarget,
  llmConfig: LLMConfig,
  workDir: string,
): Promise<void> {
  const piConfig = toPiProviderConfig(llmConfig);

  if (target === "client") {
    const piClientDir = path.join(workDir, "pi-client");
    const settingsDir = path.join(piClientDir, ".pi", "agent");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.json"),
      JSON.stringify(piConfig, null, 2),
    );
  }
  // Server config is handled via KV + Worker Secret, not local files
}

export function readPiConfig(
  workDir: string,
): { provider: string; model: string; baseUrl?: string } | null {
  const settingsPath = path.join(
    workDir,
    "pi-client",
    ".pi",
    "agent",
    "settings.json",
  );
  if (!fs.existsSync(settingsPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    return {
      provider: raw.provider,
      model: raw.model,
      baseUrl: raw.baseUrl,
    };
  } catch {
    return null;
  }
}

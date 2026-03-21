import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig, saveConfig, getSparkcoDir } from "../config.js";
import * as output from "../output.js";
import { MODEL_PRESETS, getPreset } from "../../shared/models.js";
import { writePiConfig, readPiConfig } from "../../pi/config.js";
import { maskSecret } from "../../server/secrets.js";
import { testModel } from "../wizard/llm.js";
import type { LLMConfig, LLMProvider } from "../../shared/types.js";

function getAgentConfig(): {
  client?: { provider: string; model: string };
  server?: { provider: string; model: string };
} | null {
  try {
    const config = loadConfig();
    return (config as any).agent ?? null;
  } catch {
    return null;
  }
}

function getClientLLMConfig(): LLMConfig | null {
  const piConfig = readPiConfig(getSparkcoDir());
  if (!piConfig) return null;
  const settingsPath = path.join(
    getSparkcoDir(),
    "pi-client",
    ".pi",
    "agent",
    "settings.json",
  );
  if (!fs.existsSync(settingsPath)) return null;
  const raw = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  const provider: LLMProvider =
    raw.baseUrl === "https://openrouter.ai/api/v1"
      ? "openrouter"
      : raw.provider === "anthropic"
        ? "anthropic"
        : raw.baseUrl
          ? "custom"
          : "openai";
  return {
    provider,
    model: raw.model,
    apiKey: raw.apiKey ?? "",
    baseUrl: raw.baseUrl,
  };
}

export async function modelCommand(
  action?: string,
  target?: string,
  value?: string,
): Promise<void> {
  switch (action) {
    case undefined:
    case "":
    case "show":
      showModel();
      break;
    case "set":
      if (!target || !value) {
        output.error("Usage: sparkco model set <client|server|both> <model-id>");
        return;
      }
      await setModel(target, value);
      break;
    case "list":
      listModels();
      break;
    case "key":
      if (target === "set" && value) {
        await setKey(value);
      } else {
        showKey();
      }
      break;
    case "test":
      await testModels();
      break;
    default:
      output.error(
        `Unknown action: ${action}. Use: show, set, list, key, test`,
      );
  }
}

function showModel(): void {
  const agent = getAgentConfig();
  const clientConfig = getClientLLMConfig();

  const data = {
    client: agent?.client ?? clientConfig
      ? {
          model: agent?.client?.model ?? clientConfig?.model ?? "not configured",
          provider: agent?.client?.provider ?? clientConfig?.provider ?? "unknown",
        }
      : null,
    server: agent?.server ?? null,
  };

  output.print(data, () => {
    const clientStr = data.client
      ? `${data.client.model} via ${data.client.provider}`
      : "not configured";
    const serverStr = data.server
      ? `${(data.server as any).model} via ${(data.server as any).provider}`
      : "not configured";
    return `  Client: ${clientStr}\n  Server: ${serverStr}`;
  });
}

async function setModel(target: string, modelId: string): Promise<void> {
  const config = loadConfig();
  const agentConfig = (config as any).agent ?? { client: {}, server: {} };

  if (target === "client" || target === "both") {
    agentConfig.client = {
      ...agentConfig.client,
      model: modelId,
      provider: "openrouter",
    };
    // Update pi config if key exists
    const existing = getClientLLMConfig();
    if (existing) {
      await writePiConfig(
        "client",
        { ...existing, model: modelId },
        getSparkcoDir(),
      );
    }
    output.success(`Client model updated to ${modelId}`);
  }

  if (target === "server" || target === "both") {
    agentConfig.server = {
      ...agentConfig.server,
      model: modelId,
      provider: "openrouter",
    };
    output.success(`Server model updated to ${modelId}`);
  }

  if (target !== "client" && target !== "server" && target !== "both") {
    output.error("Target must be: client, server, or both");
    return;
  }

  (config as any).agent = agentConfig;
  saveConfig(config);
}

function listModels(): void {
  const rows = MODEL_PRESETS.map((p) => [
    p.recommended ? "✦" : " ",
    p.id,
    `$${p.inputCost}/$${p.outputCost}`,
    p.description,
  ]);
  output.table(["", "model", "cost (in/out per M)", "description"], rows);
}

function showKey(): void {
  const clientConfig = getClientLLMConfig();
  if (!clientConfig || !clientConfig.apiKey) {
    output.print(
      { provider: null, key: null },
      () => "No API key configured. Run 'sparkco model key set <key>'",
    );
    return;
  }
  output.print(
    {
      provider: clientConfig.provider,
      key: maskSecret(clientConfig.apiKey),
    },
    (data) => {
      const d = data as { provider: string; key: string };
      return `  Provider: ${d.provider}\n  Key: ${d.key}`;
    },
  );
}

async function setKey(key: string): Promise<void> {
  const config = loadConfig();
  const agentConfig = (config as any).agent ?? {
    client: { provider: "openrouter", model: "minimax/minimax-m2.7" },
    server: { provider: "openrouter", model: "minimax/minimax-m2.7" },
  };

  const provider: LLMProvider = agentConfig.client?.provider ?? "openrouter";
  const model: string =
    agentConfig.client?.model ?? "minimax/minimax-m2.7";

  const llmConfig: LLMConfig = { provider, model, apiKey: key };
  await writePiConfig("client", llmConfig, getSparkcoDir());

  (config as any).agent = agentConfig;
  saveConfig(config);
  output.success("API key updated (local config).");
}

async function testModels(): Promise<void> {
  const clientConfig = getClientLLMConfig();
  if (!clientConfig || !clientConfig.apiKey) {
    output.error("No model configured. Run 'sparkco model key set <key>' first.");
    return;
  }

  const spin1 = output.spinner(`Testing client model (${clientConfig.model})...`);
  const clientResult = await testModel(clientConfig);
  spin1.stop();

  if (clientResult.success) {
    output.success(
      `Client: ${clientConfig.model} responded in ${(clientResult.latency / 1000).toFixed(1)}s`,
    );
  } else {
    output.error(`Client: ${clientResult.error}`);
  }

  // For server, use same config for now (server config comes from KV in production)
  const spin2 = output.spinner(`Testing server model (${clientConfig.model})...`);
  const serverResult = await testModel(clientConfig);
  spin2.stop();

  if (serverResult.success) {
    output.success(
      `Server: ${clientConfig.model} responded in ${(serverResult.latency / 1000).toFixed(1)}s`,
    );
  } else {
    output.error(`Server: ${serverResult.error}`);
  }
}

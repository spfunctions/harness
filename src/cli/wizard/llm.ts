import type { LLMProvider, LLMConfig } from "../../shared/types.js";
import { HarnessError } from "../../shared/errors.js";

export async function verifyOpenRouterKey(
  key: string,
): Promise<{ valid: boolean; balance?: number }> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return { valid: false };
    const data = (await res.json()) as {
      data: { limit: number | null; usage: number };
    };
    const balance =
      data.data.limit !== null
        ? data.data.limit - data.data.usage
        : undefined;
    return { valid: true, balance };
  } catch (err) {
    throw new HarnessError(
      "CONNECTION_LOST",
      `Failed to verify OpenRouter key: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function verifyAnthropicKey(
  key: string,
): Promise<{ valid: boolean }> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    // 401 = invalid key, anything else (200, 400, 429) = key is valid
    return { valid: res.status !== 401 };
  } catch (err) {
    throw new HarnessError(
      "CONNECTION_LOST",
      `Failed to verify Anthropic key: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function verifyOpenAIKey(
  key: string,
): Promise<{ valid: boolean }> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    return { valid: res.status !== 401 };
  } catch (err) {
    throw new HarnessError(
      "CONNECTION_LOST",
      `Failed to verify OpenAI key: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function verifyKey(
  provider: LLMProvider,
  key: string,
  _baseUrl?: string,
): Promise<{ valid: boolean; balance?: number }> {
  switch (provider) {
    case "openrouter":
      return verifyOpenRouterKey(key);
    case "anthropic":
      return verifyAnthropicKey(key);
    case "openai":
      return verifyOpenAIKey(key);
    case "custom":
      // For custom providers, assume key is valid if non-empty
      return { valid: key.length > 0 };
  }
}

export async function testModel(
  config: LLMConfig,
): Promise<{ success: boolean; latency: number; error?: string }> {
  const start = Date.now();

  try {
    if (config.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 5,
          messages: [{ role: "user", content: "Respond with 'ok'" }],
        }),
      });
      const latency = Date.now() - start;
      if (!res.ok) {
        const text = await res.text();
        return { success: false, latency, error: `HTTP ${res.status}: ${text}` };
      }
      return { success: true, latency };
    }

    // OpenRouter / OpenAI / Custom — all use OpenAI-compatible API
    const baseUrl =
      config.baseUrl ??
      (config.provider === "openrouter"
        ? "https://openrouter.ai/api/v1"
        : "https://api.openai.com/v1");

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: "Respond with 'ok'" }],
        max_tokens: 5,
      }),
    });
    const latency = Date.now() - start;
    if (!res.ok) {
      const text = await res.text();
      return { success: false, latency, error: `HTTP ${res.status}: ${text}` };
    }
    return { success: true, latency };
  } catch (err) {
    return {
      success: false,
      latency: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

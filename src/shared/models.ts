import type { LLMProvider } from "./types.js";

export type ModelPreset = {
  id: string;
  name: string;
  provider: LLMProvider;
  inputCost: number;
  outputCost: number;
  recommended?: boolean;
  description: string;
};

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: "minimax/minimax-m2.7",
    name: "MiniMax M2.7",
    provider: "openrouter",
    inputCost: 0.30,
    outputCost: 1.20,
    recommended: true,
    description: "最高性价比。编程能力接近前沿，$0.30/$1.20",
  },
  {
    id: "anthropic/claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "openrouter",
    inputCost: 3.00,
    outputCost: 15.00,
    recommended: false,
    description: "Anthropic 中端模型，coding 强，适合精细代码改造",
  },
  {
    id: "openai/gpt-5-2025-08-07",
    name: "GPT-5",
    provider: "openrouter",
    inputCost: 2.00,
    outputCost: 8.00,
    recommended: false,
    description: "OpenAI 旗舰模型",
  },
  {
    id: "anthropic/claude-opus-4-6",
    name: "Claude Opus 4.6",
    provider: "openrouter",
    inputCost: 15.00,
    outputCost: 75.00,
    recommended: false,
    description: "最强推理能力，成本高，适合复杂架构决策",
  },
];

export function getPreset(id: string): ModelPreset | undefined {
  return MODEL_PRESETS.find((p) => p.id === id);
}

export function getRecommended(): ModelPreset {
  return MODEL_PRESETS.find((p) => p.recommended)!;
}

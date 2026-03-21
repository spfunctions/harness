import { describe, it, expect } from "vitest";
import {
  MODEL_PRESETS,
  getPreset,
  getRecommended,
} from "../../../src/shared/models.js";

describe("MODEL_PRESETS", () => {
  it("至少有一个 recommended 模型", () => {
    const recommended = MODEL_PRESETS.filter((p) => p.recommended);
    expect(recommended.length).toBeGreaterThanOrEqual(1);
  });

  it("所有预设有 id, name, provider, inputCost, outputCost, description", () => {
    for (const preset of MODEL_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.provider).toBeTruthy();
      expect(typeof preset.inputCost).toBe("number");
      expect(typeof preset.outputCost).toBe("number");
      expect(preset.description).toBeTruthy();
    }
  });

  it("getPreset 按 id 查找正确", () => {
    const preset = getPreset("minimax/minimax-m2.7");
    expect(preset).toBeDefined();
    expect(preset!.name).toBe("MiniMax M2.7");
  });

  it("getPreset 不存在的 id 返回 undefined", () => {
    expect(getPreset("nonexistent/model")).toBeUndefined();
  });

  it("getRecommended 返回 recommended=true 的模型", () => {
    const rec = getRecommended();
    expect(rec.recommended).toBe(true);
    expect(rec.id).toBe("minimax/minimax-m2.7");
  });
});

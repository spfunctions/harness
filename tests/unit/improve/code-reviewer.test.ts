import { describe, it, expect } from "vitest";
import {
  REVIEW_DIMENSIONS,
  getCurrentDimension,
  buildReviewPrompt,
  parseReviewResponse,
  findingsToIssues,
} from "../../../src/improve/code-reviewer.js";

describe("REVIEW_DIMENSIONS", () => {
  it("has at least 3 review dimensions", () => {
    expect(REVIEW_DIMENSIONS.length).toBeGreaterThanOrEqual(3);
  });

  it("each dimension has dimension, files, prompt_template", () => {
    for (const d of REVIEW_DIMENSIONS) {
      expect(d.dimension).toBeTruthy();
      expect(d.files.length).toBeGreaterThan(0);
      expect(d.prompt_template).toContain("{{code}}");
    }
  });
});

describe("getCurrentDimension", () => {
  it("rotates through dimensions based on cycle count", () => {
    const d0 = getCurrentDimension(0);
    const d1 = getCurrentDimension(1);
    const d0again = getCurrentDimension(REVIEW_DIMENSIONS.length);
    expect(d0.dimension).toBe(REVIEW_DIMENSIONS[0].dimension);
    expect(d1.dimension).toBe(REVIEW_DIMENSIONS[1].dimension);
    expect(d0again.dimension).toBe(d0.dimension); // wraps around
  });
});

describe("buildReviewPrompt", () => {
  it("replaces {{code}} with source code", () => {
    const sources = new Map<string, string>();
    sources.set("src/client/daemon.ts", "const x = 1;");
    const target = REVIEW_DIMENSIONS[0];
    const prompt = buildReviewPrompt(target, sources);
    expect(prompt).toContain("const x = 1;");
    expect(prompt).not.toContain("{{code}}");
  });

  it("skips files not in sources map", () => {
    const sources = new Map<string, string>();
    const target = REVIEW_DIMENSIONS[0];
    const prompt = buildReviewPrompt(target, sources);
    expect(prompt).not.toContain("undefined");
  });
});

describe("parseReviewResponse", () => {
  it("parses valid JSON array response", () => {
    const response = `Here are the findings:
[{"file":"src/test.ts","line_hint":"fn()","problem":"no try-catch","suggestion":"add try","confidence":"high"}]`;
    const findings = parseReviewResponse(response);
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe("src/test.ts");
  });

  it("returns empty array for no-JSON response", () => {
    expect(parseReviewResponse("No issues found.")).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseReviewResponse("[{broken")).toEqual([]);
  });

  it("filters out entries missing required fields", () => {
    const response = '[{"file":"x","problem":"y","confidence":"high"},{"nofile":true}]';
    const findings = parseReviewResponse(response);
    expect(findings).toHaveLength(1);
  });
});

describe("findingsToIssues", () => {
  it("converts high-confidence findings to issues", () => {
    const findings = [
      {
        file: "src/test.ts",
        line_hint: "fn()",
        problem: "unhandled error",
        suggestion: "add try-catch",
        confidence: "high" as const,
      },
    ];
    const issues = findingsToIssues(findings, "error-handling");
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("code-quality");
    expect(issues[0].discovered_by).toBe("code-review");
  });

  it("filters out non-high confidence", () => {
    const findings = [
      {
        file: "x",
        line_hint: "",
        problem: "minor",
        suggestion: "",
        confidence: "low" as const,
      },
    ];
    expect(findingsToIssues(findings, "test")).toHaveLength(0);
  });
});

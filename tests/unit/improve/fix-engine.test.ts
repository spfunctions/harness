import { describe, it, expect } from "vitest";
import {
  buildFixPrompt,
  parseTestOutput,
} from "../../../src/improve/fix-engine.js";
import type { Issue } from "../../../src/shared/types.js";

const testIssue: Issue = {
  id: "iss-test-001",
  type: "bug",
  severity: "high",
  title: "decode crashes on empty string",
  description: "Calling decode('') throws unhandled error instead of HarnessError",
  reproduction: "import { decode } from './codec'; decode('');",
  affected_files: ["src/protocol/codec.ts"],
  discovered_by: "fuzzer",
  discovered_at: Date.now(),
};

describe("buildFixPrompt", () => {
  it("includes issue type, severity, title", () => {
    const prompt = buildFixPrompt(testIssue, 1, "/repo");
    expect(prompt).toContain("bug");
    expect(prompt).toContain("high");
    expect(prompt).toContain("decode crashes on empty string");
  });

  it("includes description and reproduction", () => {
    const prompt = buildFixPrompt(testIssue, 1, "/repo");
    expect(prompt).toContain("Calling decode");
    expect(prompt).toContain("import { decode }");
  });

  it("includes affected_files", () => {
    const prompt = buildFixPrompt(testIssue, 1, "/repo");
    expect(prompt).toContain("src/protocol/codec.ts");
  });

  it("on attempt > 1, warns not to repeat", () => {
    const prompt = buildFixPrompt(testIssue, 2, "/repo");
    expect(prompt).toContain("attempt 2");
    expect(prompt).toContain("Re-analyze");
  });

  it("omits affected_files section when none", () => {
    const issue = { ...testIssue, affected_files: undefined };
    const prompt = buildFixPrompt(issue, 1, "/repo");
    expect(prompt).not.toContain("Likely affected files");
  });
});

describe("parseTestOutput", () => {
  it("parses vitest passed output", () => {
    const result = parseTestOutput("Tests  42 passed (42)");
    expect(result.passed).toBe(42);
    expect(result.failed).toBe(0);
  });

  it("parses vitest mixed output", () => {
    const result = parseTestOutput("Tests  3 failed | 39 passed (42)");
    expect(result.passed).toBe(39);
    expect(result.failed).toBe(3);
  });

  it("handles no match gracefully", () => {
    const result = parseTestOutput("some random output");
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
  });
});

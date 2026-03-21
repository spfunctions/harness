import type { Issue, LLMConfig } from "../shared/types.js";
import { nanoid } from "nanoid";

export interface ReviewTarget {
  dimension: string;
  files: string[];
  prompt_template: string;
}

export interface ReviewFinding {
  file: string;
  line_hint: string;
  problem: string;
  suggestion: string;
  confidence: "high" | "medium" | "low";
}

export const REVIEW_DIMENSIONS: ReviewTarget[] = [
  {
    dimension: "error-handling",
    files: [
      "src/client/daemon.ts",
      "src/client/sse-client.ts",
      "src/server/durable-object.ts",
    ],
    prompt_template: `Review this TypeScript code for error handling issues:

{{code}}

Find:
1. Async operations without try-catch
2. Catch blocks that swallow errors (empty catch or log-only)
3. Unhandled promise rejections
4. Functions that may throw but callers don't handle

Return JSON array:
[{"file":"...","line_hint":"...","problem":"...","suggestion":"...","confidence":"high|medium|low"}]

Only return confidence=high findings. Empty array if no issues.`,
  },
  {
    dimension: "resource-leaks",
    files: [
      "src/client/sse-client.ts",
      "src/client/local-server.ts",
      "src/client/process-manager.ts",
      "src/client/daemon.ts",
    ],
    prompt_template: `Review this TypeScript code for resource leaks:

{{code}}

Find:
1. Event listeners not removed on cleanup
2. Timers (setInterval/setTimeout) not cleared
3. Streams not closed
4. File descriptors not released

Return JSON array:
[{"file":"...","line_hint":"...","problem":"...","suggestion":"...","confidence":"high|medium|low"}]

Only return confidence=high findings. Empty array if no issues.`,
  },
  {
    dimension: "input-validation",
    files: [
      "src/protocol/codec.ts",
      "src/protocol/messages.ts",
      "src/server/worker.ts",
      "src/client/local-server.ts",
    ],
    prompt_template: `Review this TypeScript code for input validation gaps:

{{code}}

Find:
1. External inputs used without validation
2. Missing bounds checks on arrays/strings
3. Type assertions without runtime checks
4. Unsafe JSON.parse without error handling

Return JSON array:
[{"file":"...","line_hint":"...","problem":"...","suggestion":"...","confidence":"high|medium|low"}]

Only return confidence=high findings. Empty array if no issues.`,
  },
  {
    dimension: "test-coverage",
    files: [
      "tests/unit/protocol/codec.test.ts",
      "tests/unit/client/sse-client.test.ts",
      "tests/unit/server/durable-object.test.ts",
    ],
    prompt_template: `Review these test files against the source code:

{{code}}

Find:
1. Code paths not covered by any test
2. Edge cases not tested
3. Assertions that don't verify the actual behavior
4. Missing error-path tests

Return JSON array:
[{"file":"...","line_hint":"...","problem":"...","suggestion":"...","confidence":"high|medium|low"}]

Only return confidence=high findings. Empty array if no issues.`,
  },
];

export function getCurrentDimension(cycleCount: number): ReviewTarget {
  return REVIEW_DIMENSIONS[cycleCount % REVIEW_DIMENSIONS.length];
}

export function buildReviewPrompt(
  target: ReviewTarget,
  sourceCode: Map<string, string>,
): string {
  const codeBlocks = target.files
    .map((f) => {
      const content = sourceCode.get(f);
      if (!content) return null;
      return `// === ${f} ===\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");

  return target.prompt_template.replace("{{code}}", codeBlocks);
}

export function parseReviewResponse(raw: string): ReviewFinding[] {
  try {
    // Extract JSON array from LLM response (may have text around it)
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f: unknown) =>
        typeof f === "object" &&
        f !== null &&
        "file" in f &&
        "problem" in f &&
        "confidence" in f,
    ) as ReviewFinding[];
  } catch {
    return [];
  }
}

export function findingsToIssues(findings: ReviewFinding[], dimension: string): Issue[] {
  const highFindings = findings.filter((f) => f.confidence === "high");
  if (highFindings.length === 0) return [];

  return highFindings.map((f) => ({
    id: `iss-review-${nanoid(8)}`,
    type: "code-quality" as const,
    severity: "medium" as const,
    title: f.problem,
    description: `${f.problem}\n\nSuggestion: ${f.suggestion}`,
    reproduction: `Review ${f.file} near ${f.line_hint}`,
    affected_files: [f.file],
    discovered_by: "code-review" as const,
    discovered_at: Date.now(),
  }));
}

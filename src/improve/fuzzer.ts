import { nanoid } from "nanoid";
import type { FuzzCase, FuzzResult, Issue } from "../shared/types.js";

const MESSAGE_TYPES = [
  "capability-request",
  "capability-ready",
  "data",
  "state-sync",
  "negotiate",
] as const;

// Valid base messages for mutation
const BASE_MESSAGES: Record<string, Record<string, unknown>> = {
  "capability-request": {
    type: "capability-request",
    id: "fuzz-001",
    from: "client",
    description: "test",
    timestamp: 1700000000000,
  },
  "capability-ready": {
    type: "capability-ready",
    id: "fuzz-002",
    from: "server",
    ref: "ref-001",
    endpoint: "/api/test",
    timestamp: 1700000000000,
  },
  data: {
    type: "data",
    id: "fuzz-003",
    from: "client",
    channel: "test-ch",
    payload: { key: "value" },
    timestamp: 1700000000000,
  },
  "state-sync": {
    type: "state-sync",
    id: "fuzz-004",
    from: "client",
    version: "v001",
    processes: [],
    health: "ok",
    timestamp: 1700000000000,
  },
  negotiate: {
    type: "negotiate",
    id: "fuzz-005",
    from: "client",
    ref: "ref-001",
    content: "test content",
    timestamp: 1700000000000,
  },
};

// Required fields per message type (excluding 'type')
const REQUIRED_FIELDS: Record<string, string[]> = {
  "capability-request": ["id", "from", "description", "timestamp"],
  "capability-ready": ["id", "from", "ref", "endpoint", "timestamp"],
  data: ["id", "from", "channel", "payload", "timestamp"],
  "state-sync": ["id", "from", "version", "processes", "health", "timestamp"],
  negotiate: ["id", "from", "ref", "content", "timestamp"],
};

function generateMissingFieldCases(): FuzzCase[] {
  const cases: FuzzCase[] = [];
  for (const type of MESSAGE_TYPES) {
    const base = { ...BASE_MESSAGES[type] };
    for (const field of REQUIRED_FIELDS[type]) {
      const mutated = { ...base };
      delete mutated[field];
      cases.push({
        id: `fuzz-missing-${type}-${field}`,
        strategy: "missing-field",
        input: JSON.stringify(mutated),
        expect: "reject",
        description: `${type} without required field '${field}'`,
      });
    }
  }
  return cases;
}

function generateWrongTypeCases(): FuzzCase[] {
  const cases: FuzzCase[] = [];
  const wrongValues: Record<string, unknown> = {
    id: 12345,
    from: "mars",
    description: 42,
    ref: false,
    endpoint: null,
    channel: 0,
    content: [],
    version: true,
    health: "perfect",
    timestamp: "not-a-number",
    processes: "not-an-array",
  };
  for (const type of MESSAGE_TYPES) {
    const base = { ...BASE_MESSAGES[type] };
    for (const field of REQUIRED_FIELDS[type]) {
      if (field in wrongValues) {
        const mutated = { ...base, [field]: wrongValues[field] };
        cases.push({
          id: `fuzz-wrongtype-${type}-${field}`,
          strategy: "wrong-type",
          input: JSON.stringify(mutated),
          expect: "reject",
          description: `${type} with wrong type for '${field}'`,
        });
      }
    }
  }
  return cases;
}

function generateBoundaryValueCases(): FuzzCase[] {
  const cases: FuzzCase[] = [];
  const boundaries: Array<{ name: string; field: string; value: unknown; types: string[] }> = [
    { name: "empty-id", field: "id", value: "", types: MESSAGE_TYPES as unknown as string[] },
    { name: "long-description", field: "description", value: "x".repeat(10000), types: ["capability-request"] },
    { name: "negative-timestamp", field: "timestamp", value: -1, types: MESSAGE_TYPES as unknown as string[] },
    { name: "zero-timestamp", field: "timestamp", value: 0, types: ["data"] },
    { name: "unicode-content", field: "content", value: "日本語テスト 🎉 \u0000 \uFFFD", types: ["negotiate"] },
    { name: "long-channel", field: "channel", value: "a".repeat(200), types: ["data"] },
    { name: "empty-channel", field: "channel", value: "", types: ["data"] },
    { name: "channel-special", field: "channel", value: "has space!@#", types: ["data"] },
    { name: "empty-processes", field: "processes", value: [], types: ["state-sync"] },
    { name: "nested-payload", field: "payload", value: createDeepNest(50), types: ["data"] },
    { name: "null-payload", field: "payload", value: null, types: ["data"] },
    { name: "huge-payload", field: "payload", value: { data: "x".repeat(100000) }, types: ["data"] },
  ];

  for (const b of boundaries) {
    for (const type of b.types) {
      if (type in BASE_MESSAGES) {
        const base = { ...BASE_MESSAGES[type] };
        if (b.field in base || b.field === "payload") {
          const mutated = { ...base, [b.field]: b.value };
          const shouldReject =
            b.name === "empty-id" ||
            b.name === "long-channel" ||
            b.name === "empty-channel" ||
            b.name === "channel-special";
          cases.push({
            id: `fuzz-boundary-${type}-${b.name}`,
            strategy: "boundary-value",
            input: JSON.stringify(mutated),
            expect: shouldReject ? "reject" : "accept",
            description: `${type} with boundary value: ${b.name}`,
          });
        }
      }
    }
  }
  return cases;
}

function createDeepNest(depth: number): unknown {
  if (depth === 0) return "leaf";
  return { nested: createDeepNest(depth - 1) };
}

function generateMalformedJsonCases(): FuzzCase[] {
  return [
    {
      id: "fuzz-malformed-not-json",
      strategy: "malformed-json",
      input: "not json at all",
      expect: "reject",
      description: "Non-JSON input",
    },
    {
      id: "fuzz-malformed-incomplete",
      strategy: "malformed-json",
      input: '{"type": "data", "id": "x"',
      expect: "reject",
      description: "Incomplete JSON (missing closing brace)",
    },
    {
      id: "fuzz-malformed-trailing-comma",
      strategy: "malformed-json",
      input: '{"type": "data", "id": "x",}',
      expect: "reject",
      description: "JSON with trailing comma",
    },
    {
      id: "fuzz-malformed-empty",
      strategy: "malformed-json",
      input: "",
      expect: "reject",
      description: "Empty string input",
    },
    {
      id: "fuzz-malformed-null",
      strategy: "malformed-json",
      input: "null",
      expect: "reject",
      description: "JSON null value",
    },
    {
      id: "fuzz-malformed-array",
      strategy: "malformed-json",
      input: "[]",
      expect: "reject",
      description: "JSON array instead of object",
    },
    {
      id: "fuzz-malformed-bom",
      strategy: "malformed-json",
      input: "\uFEFF" + JSON.stringify(BASE_MESSAGES["data"]),
      expect: "reject",
      description: "JSON with BOM prefix",
    },
  ];
}

function generateProtocolViolationCases(): FuzzCase[] {
  return [
    {
      id: "fuzz-protocol-unknown-type",
      strategy: "protocol-violation",
      input: JSON.stringify({
        type: "unknown-type",
        id: "x",
        from: "client",
        timestamp: Date.now(),
      }),
      expect: "reject",
      description: "Unknown message type",
    },
    {
      id: "fuzz-protocol-ready-before-request",
      strategy: "protocol-violation",
      input: JSON.stringify({
        type: "capability-ready",
        id: "x",
        from: "server",
        ref: "nonexistent-request",
        endpoint: "/test",
        timestamp: Date.now(),
      }),
      expect: "accept", // Protocol allows this — ref validation is app-level
      description: "capability-ready referencing non-existent request",
    },
    {
      id: "fuzz-protocol-duplicate-id",
      strategy: "protocol-violation",
      input: JSON.stringify(BASE_MESSAGES["data"]),
      expect: "accept", // Same message twice should be idempotent
      description: "Duplicate message ID (sent twice)",
    },
    {
      id: "fuzz-protocol-no-type",
      strategy: "protocol-violation",
      input: JSON.stringify({ id: "x", from: "client", timestamp: 0 }),
      expect: "reject",
      description: "Message without type field",
    },
  ];
}

export function generateFuzzCases(): FuzzCase[] {
  return [
    ...generateMissingFieldCases(),
    ...generateWrongTypeCases(),
    ...generateBoundaryValueCases(),
    ...generateMalformedJsonCases(),
    ...generateProtocolViolationCases(),
  ];
}

export function judgeFuzzResult(
  fuzzCase: FuzzCase,
  actual: FuzzResult["actual"],
): FuzzResult {
  let is_bug = false;
  if (fuzzCase.expect === "reject" && actual === "accepted") is_bug = true;
  if (actual === "crashed") is_bug = true;
  if (actual === "timeout") is_bug = true;
  if (actual === "unexpected") is_bug = true;

  return {
    case_id: fuzzCase.id,
    actual,
    is_bug,
  };
}

export function fuzzResultsToIssues(
  cases: FuzzCase[],
  results: FuzzResult[],
): Issue[] {
  const bugs = results.filter((r) => r.is_bug);
  if (bugs.length === 0) return [];

  // Group by strategy
  const byStrategy = new Map<string, { cases: FuzzCase[]; results: FuzzResult[] }>();
  for (const bug of bugs) {
    const fc = cases.find((c) => c.id === bug.case_id);
    if (!fc) continue;
    const group = byStrategy.get(fc.strategy) ?? { cases: [], results: [] };
    group.cases.push(fc);
    group.results.push(bug);
    byStrategy.set(fc.strategy, group);
  }

  const issues: Issue[] = [];
  for (const [strategy, group] of byStrategy) {
    issues.push({
      id: `iss-fuzz-${nanoid(8)}`,
      type: group.results.some((r) => r.actual === "crashed") ? "fuzz-crash" : "edge-case",
      severity: group.results.some((r) => r.actual === "crashed") ? "high" : "medium",
      title: `Fuzzer found ${group.cases.length} issue(s) via ${strategy}`,
      description: group.cases
        .map((c) => `- ${c.description}: expected ${c.expect}, got ${group.results.find((r) => r.case_id === c.id)?.actual}`)
        .join("\n"),
      reproduction: group.cases.map((c) => `echo '${c.input}' | decode()`).join("\n"),
      affected_files: ["src/protocol/codec.ts"],
      discovered_by: "fuzzer",
      discovered_at: Date.now(),
    });
  }
  return issues;
}

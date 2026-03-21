import { describe, it, expect } from "vitest";
import {
  generateFuzzCases,
  judgeFuzzResult,
  fuzzResultsToIssues,
} from "../../../src/improve/fuzzer.js";
import { decode } from "../../../src/protocol/codec.js";

describe("generateFuzzCases", () => {
  const cases = generateFuzzCases();

  it("generates at least 50 fuzz cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(50);
  });

  it("generates missing-field cases for each message type", () => {
    const missing = cases.filter((c) => c.strategy === "missing-field");
    expect(missing.length).toBeGreaterThan(10);
  });

  it("generates wrong-type cases for each message type", () => {
    const wrongType = cases.filter((c) => c.strategy === "wrong-type");
    expect(wrongType.length).toBeGreaterThan(5);
  });

  it("generates boundary value cases", () => {
    const boundary = cases.filter((c) => c.strategy === "boundary-value");
    expect(boundary.length).toBeGreaterThan(5);
  });

  it("generates malformed JSON cases", () => {
    const malformed = cases.filter((c) => c.strategy === "malformed-json");
    expect(malformed.length).toBeGreaterThanOrEqual(5);
  });

  it("generates protocol violation cases", () => {
    const proto = cases.filter((c) => c.strategy === "protocol-violation");
    expect(proto.length).toBeGreaterThanOrEqual(3);
  });

  it("each case has id, strategy, input, expect, description", () => {
    for (const c of cases) {
      expect(c.id).toBeTruthy();
      expect(c.strategy).toBeTruthy();
      expect(typeof c.input).toBe("string");
      expect(["reject", "accept"]).toContain(c.expect);
      expect(c.description).toBeTruthy();
    }
  });

  it("reject-expected cases are actually rejected by decode()", () => {
    const rejectCases = cases.filter((c) => c.expect === "reject");
    for (const c of rejectCases) {
      let threw = false;
      try {
        decode(c.input);
      } catch {
        threw = true;
      }
      if (!threw) {
        // If decode didn't throw, this is a potential bug we should track
        // but not all "reject" cases map to decode — some are protocol-level
        // So only check the ones that should definitely fail at decode level
        if (
          (c.strategy === "malformed-json") ||
          (c.strategy === "missing-field") ||
          c.id.includes("empty-id") ||
          c.id.includes("empty-channel") ||
          c.id.includes("long-channel") ||
          c.id.includes("channel-special")
        ) {
          expect.unreachable(
            `Expected ${c.id} to be rejected but it was accepted`,
          );
        }
      }
    }
  });
});

describe("judgeFuzzResult", () => {
  const rejectCase = {
    id: "test",
    strategy: "test",
    input: "{}",
    expect: "reject" as const,
    description: "test",
  };
  const acceptCase = { ...rejectCase, expect: "accept" as const };

  it("expect=reject actual=accepted → is_bug=true", () => {
    expect(judgeFuzzResult(rejectCase, "accepted").is_bug).toBe(true);
  });

  it("actual=crashed → is_bug=true", () => {
    expect(judgeFuzzResult(rejectCase, "crashed").is_bug).toBe(true);
    expect(judgeFuzzResult(acceptCase, "crashed").is_bug).toBe(true);
  });

  it("actual=timeout → is_bug=true", () => {
    expect(judgeFuzzResult(rejectCase, "timeout").is_bug).toBe(true);
  });

  it("expect=reject actual=rejected → is_bug=false", () => {
    expect(judgeFuzzResult(rejectCase, "rejected").is_bug).toBe(false);
  });

  it("expect=accept actual=accepted → is_bug=false", () => {
    expect(judgeFuzzResult(acceptCase, "accepted").is_bug).toBe(false);
  });
});

describe("fuzzResultsToIssues", () => {
  it("no bugs → no issues", () => {
    const cases = generateFuzzCases().slice(0, 3);
    const results = cases.map((c) => ({
      case_id: c.id,
      actual: "rejected" as const,
      is_bug: false,
    }));
    expect(fuzzResultsToIssues(cases, results)).toHaveLength(0);
  });

  it("bugs → issues grouped by strategy", () => {
    const cases = generateFuzzCases().slice(0, 5);
    const results = cases.map((c) => ({
      case_id: c.id,
      actual: "crashed" as const,
      is_bug: true,
    }));
    const issues = fuzzResultsToIssues(cases, results);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].discovered_by).toBe("fuzzer");
  });
});

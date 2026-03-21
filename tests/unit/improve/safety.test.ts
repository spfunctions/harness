import { describe, it, expect } from "vitest";
import {
  DEFAULT_LIMITS,
  createInitialState,
  canSendIssue,
  canStartFix,
  recordIssueSent,
  recordFixStart,
  recordFixEnd,
} from "../../../src/improve/safety.js";

describe("safety limits", () => {
  it("allows sending issues initially", () => {
    const state = createInitialState();
    expect(canSendIssue(state, DEFAULT_LIMITS)).toBe(true);
  });

  it("blocks after maxIssuesPerHour", () => {
    const state = createInitialState();
    for (let i = 0; i < DEFAULT_LIMITS.maxIssuesPerHour; i++) {
      recordIssueSent(state);
    }
    expect(canSendIssue(state, DEFAULT_LIMITS)).toBe(false);
  });

  it("resets hourly counter after 1 hour", () => {
    const state = createInitialState();
    for (let i = 0; i < DEFAULT_LIMITS.maxIssuesPerHour; i++) {
      recordIssueSent(state);
    }
    state.hourStart = Date.now() - 3700000; // 1 hour ago
    expect(canSendIssue(state, DEFAULT_LIMITS)).toBe(true);
  });

  it("allows starting a fix initially", () => {
    const state = createInitialState();
    expect(canStartFix(state, DEFAULT_LIMITS)).toBe(true);
  });

  it("blocks concurrent fixes", () => {
    const state = createInitialState();
    recordFixStart(state);
    expect(canStartFix(state, DEFAULT_LIMITS)).toBe(false);
  });

  it("allows fix after previous completes", () => {
    const state = createInitialState();
    recordFixStart(state);
    recordFixEnd(state, false, DEFAULT_LIMITS);
    expect(canStartFix(state, DEFAULT_LIMITS)).toBe(true);
  });

  it("triggers cooldown after 3 consecutive abandons", () => {
    const state = createInitialState();
    for (let i = 0; i < 3; i++) {
      recordFixStart(state);
      recordFixEnd(state, true, DEFAULT_LIMITS);
    }
    expect(canStartFix(state, DEFAULT_LIMITS)).toBe(false);
  });

  it("resets consecutive abandons on success", () => {
    const state = createInitialState();
    recordFixStart(state);
    recordFixEnd(state, true, DEFAULT_LIMITS);
    recordFixStart(state);
    recordFixEnd(state, true, DEFAULT_LIMITS);
    recordFixStart(state);
    recordFixEnd(state, false, DEFAULT_LIMITS); // success resets
    expect(state.consecutiveAbandons).toBe(0);
  });

  it("blocks after daily LLM limit", () => {
    const state = createInitialState();
    state.llmCallsToday = DEFAULT_LIMITS.maxDailyLLMCalls;
    expect(canSendIssue(state, DEFAULT_LIMITS)).toBe(false);
    expect(canStartFix(state, DEFAULT_LIMITS)).toBe(false);
  });
});

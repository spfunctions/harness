export interface SafetyLimits {
  maxIssuesPerHour: number;
  maxFixAttemptsPerIssue: number;
  maxConcurrentFixes: number;
  cooldownAfterFailMs: number;
  maxDailyLLMCalls: number;
}

export const DEFAULT_LIMITS: SafetyLimits = {
  maxIssuesPerHour: 10,
  maxFixAttemptsPerIssue: 3,
  maxConcurrentFixes: 1,
  cooldownAfterFailMs: 600000, // 10 minutes
  maxDailyLLMCalls: 100,
};

export interface SafetyState {
  issuesThisHour: number;
  hourStart: number;
  consecutiveAbandons: number;
  cooldownUntil: number;
  llmCallsToday: number;
  dayStart: number;
  currentlyFixing: boolean;
}

export function createInitialState(): SafetyState {
  const now = Date.now();
  return {
    issuesThisHour: 0,
    hourStart: now,
    consecutiveAbandons: 0,
    cooldownUntil: 0,
    llmCallsToday: 0,
    dayStart: now,
    currentlyFixing: false,
  };
}

export function canSendIssue(state: SafetyState, limits: SafetyLimits): boolean {
  const now = Date.now();

  // Reset hourly counter
  if (now - state.hourStart > 3600000) {
    state.issuesThisHour = 0;
    state.hourStart = now;
  }

  // Reset daily counter
  if (now - state.dayStart > 86400000) {
    state.llmCallsToday = 0;
    state.dayStart = now;
  }

  if (state.issuesThisHour >= limits.maxIssuesPerHour) return false;
  if (now < state.cooldownUntil) return false;
  if (state.llmCallsToday >= limits.maxDailyLLMCalls) return false;

  return true;
}

export function canStartFix(state: SafetyState, limits: SafetyLimits): boolean {
  if (state.currentlyFixing) return false;
  const now = Date.now();
  if (now < state.cooldownUntil) return false;
  if (state.llmCallsToday >= limits.maxDailyLLMCalls) return false;
  return true;
}

export function recordIssueSent(state: SafetyState): void {
  state.issuesThisHour++;
}

export function recordFixStart(state: SafetyState): void {
  state.currentlyFixing = true;
  state.llmCallsToday++;
}

export function recordFixEnd(state: SafetyState, abandoned: boolean, limits: SafetyLimits): void {
  state.currentlyFixing = false;
  if (abandoned) {
    state.consecutiveAbandons++;
    if (state.consecutiveAbandons >= 3) {
      state.cooldownUntil = Date.now() + limits.cooldownAfterFailMs;
      state.consecutiveAbandons = 0;
    }
  } else {
    state.consecutiveAbandons = 0;
  }
}

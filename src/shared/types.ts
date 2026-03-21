// === 消息类型 ===

export type Origin = "client" | "server";

export type CapabilityRequest = {
  type: "capability-request";
  id: string;
  from: Origin;
  description: string;
  schema?: unknown;
  timestamp: number;
};

export type CapabilityReady = {
  type: "capability-ready";
  id: string;
  from: Origin;
  ref: string;
  endpoint: string;
  meta?: Record<string, unknown>;
  timestamp: number;
};

export type DataMessage = {
  type: "data";
  id: string;
  from: Origin;
  channel: string;
  payload: unknown;
  timestamp: number;
};

export type StateSync = {
  type: "state-sync";
  id: string;
  from: Origin;
  version: string;
  processes: ProcessDeclaration[];
  health: "ok" | "degraded" | "error";
  timestamp: number;
};

export type Negotiate = {
  type: "negotiate";
  id: string;
  from: Origin;
  ref: string;
  content: string;
  timestamp: number;
};

export type Message =
  | CapabilityRequest
  | CapabilityReady
  | DataMessage
  | StateSync
  | Negotiate;

export type MessageType = Message["type"];

// === 进程声明 ===

export type ProcessDeclaration = {
  name: string;
  entry: string;
  type: "persistent" | "cron";
  schedule?: string;
  port?: number;
};

// === Manifest ===

export type SideState = {
  commit: string;
  processes: ProcessDeclaration[];
};

export type Manifest = {
  version: string;
  timestamp: number;
  server: SideState;
  client: SideState;
  decision_trace?: string;
  rollback_to?: string;
};

// === SSE 事件 ===

export type SSEEvent = {
  id: string;
  event: MessageType;
  data: string;
};

// === LLM / Agent 配置 ===

export type LLMProvider = "openrouter" | "anthropic" | "openai" | "custom";

export type LLMConfig = {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export type AgentConfig = {
  client: LLMConfig;
  server: LLMConfig;
};

// === Self-Improvement (Phase 2) ===

export type IssueType = "bug" | "edge-case" | "fuzz-crash" | "perf" | "code-quality";
export type IssueSeverity = "critical" | "high" | "medium" | "low";
export type IssueDiscoverer = "test-runner" | "fuzzer" | "stress-test" | "code-review";

export interface Issue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  title: string;
  description: string;
  reproduction: string;
  affected_files?: string[];
  discovered_by: IssueDiscoverer;
  discovered_at: number;
}

export type FixStatus = "attempting" | "testing" | "passed" | "failed" | "abandoned";

export interface Fix {
  id: string;
  issue_ref: string;
  status: FixStatus;
  diff_summary: string;
  files_changed: string[];
  test_result?: {
    passed: number;
    failed: number;
    new_tests_added: number;
  };
  commit_hash?: string;
  attempts: number;
}

export interface DashboardState {
  cycle_count: number;
  issues_found: number;
  issues_fixed: number;
  issues_abandoned: number;
  current_issue?: Issue;
  recent_fixes: Fix[];
  recent_issues: Issue[];
  llm_calls_today: number;
  llm_tokens_today: number;
  last_cycle_at: number;
  health: "running" | "paused" | "cooldown" | "limit-reached";
}

export interface FuzzCase {
  id: string;
  strategy: string;
  input: string;
  expect: "reject" | "accept";
  description: string;
}

export interface FuzzResult {
  case_id: string;
  actual: "rejected" | "accepted" | "crashed" | "timeout" | "unexpected";
  response?: string;
  is_bug: boolean;
}

export interface StressScenario {
  id: string;
  name: string;
}

export interface StressResult {
  scenario_id: string;
  passed: boolean;
  metrics: {
    messages_sent?: number;
    messages_received?: number;
    avg_latency_ms?: number;
    max_latency_ms?: number;
    errors?: string[];
  };
  is_regression: boolean;
}

// === 错误 ===

export type HarnessErrorCode =
  | "INVALID_MESSAGE"
  | "UNKNOWN_MESSAGE_TYPE"
  | "MISSING_FIELD"
  | "CONNECTION_LOST"
  | "DEPLOY_FAILED"
  | "PROCESS_FAILED"
  | "GIT_FAILED"
  | "MANIFEST_CONFLICT";

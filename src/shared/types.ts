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

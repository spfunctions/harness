import { z } from "zod";
import type { Message, SSEEvent, MessageType } from "../shared/types.js";
import { HarnessError } from "../shared/errors.js";

const originSchema = z.enum(["client", "server"]);

const capabilityRequestSchema = z.object({
  type: z.literal("capability-request"),
  id: z.string().min(1),
  from: originSchema,
  description: z.string(),
  schema: z.unknown().optional(),
  timestamp: z.number(),
});

const capabilityReadySchema = z.object({
  type: z.literal("capability-ready"),
  id: z.string().min(1),
  from: originSchema,
  ref: z.string().min(1),
  endpoint: z.string(),
  meta: z.record(z.unknown()).optional(),
  timestamp: z.number(),
});

export const channelSchema = z
  .string()
  .min(1, "channel must not be empty")
  .max(128, "channel must not exceed 128 characters")
  .regex(
    /^[a-zA-Z0-9\-_\/]+$/,
    "channel may only contain letters, digits, -, _, /",
  );

const dataMessageSchema = z.object({
  type: z.literal("data"),
  id: z.string().min(1),
  from: originSchema,
  channel: channelSchema,
  payload: z.unknown(),
  timestamp: z.number(),
});

const stateSyncSchema = z.object({
  type: z.literal("state-sync"),
  id: z.string().min(1),
  from: originSchema,
  version: z.string(),
  processes: z.array(
    z.object({
      name: z.string(),
      entry: z.string(),
      type: z.enum(["persistent", "cron"]),
      schedule: z.string().optional(),
      port: z.number().optional(),
    }),
  ),
  health: z.enum(["ok", "degraded", "error"]),
  timestamp: z.number(),
});

const negotiateSchema = z.object({
  type: z.literal("negotiate"),
  id: z.string().min(1),
  from: originSchema,
  ref: z.string().min(1),
  content: z.string(),
  timestamp: z.number(),
});

const messageSchema = z.discriminatedUnion("type", [
  capabilityRequestSchema,
  capabilityReadySchema,
  dataMessageSchema,
  stateSyncSchema,
  negotiateSchema,
]);

export function encode(message: Message): string {
  return JSON.stringify(message);
}

export function decode(raw: string): Message {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HarnessError("INVALID_MESSAGE", `Invalid JSON: ${raw}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new HarnessError("INVALID_MESSAGE", "Message must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  if (!("type" in obj) || obj.type === undefined) {
    throw new HarnessError("MISSING_FIELD", 'Missing required field: "type"');
  }

  const validTypes: MessageType[] = [
    "capability-request",
    "capability-ready",
    "data",
    "state-sync",
    "negotiate",
  ];
  if (!validTypes.includes(obj.type as MessageType)) {
    throw new HarnessError(
      "UNKNOWN_MESSAGE_TYPE",
      `Unknown message type: ${String(obj.type)}`,
    );
  }

  if (!("id" in obj) || !obj.id) {
    throw new HarnessError("MISSING_FIELD", 'Missing required field: "id"');
  }

  if (!("from" in obj) || obj.from === undefined) {
    throw new HarnessError("MISSING_FIELD", 'Missing required field: "from"');
  }

  // data messages require payload field to be present
  if (obj.type === "data" && !("payload" in obj)) {
    throw new HarnessError("MISSING_FIELD", 'Missing required field: "payload"');
  }

  const result = messageSchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue.path.join(".");
    if (firstIssue.code === "invalid_enum_value" && path === "from") {
      throw new HarnessError(
        "INVALID_MESSAGE",
        `Invalid "from" value: ${String(obj.from)}`,
      );
    }
    if (
      firstIssue.code === "invalid_type" &&
      firstIssue.received === "undefined"
    ) {
      throw new HarnessError(
        "MISSING_FIELD",
        `Missing required field: "${path}"`,
      );
    }
    throw new HarnessError(
      "INVALID_MESSAGE",
      `Invalid message: ${result.error.message}`,
    );
  }

  return result.data as Message;
}

export function toSSEEvent(message: Message): SSEEvent {
  return {
    id: message.id,
    event: message.type,
    data: encode(message),
  };
}

export function fromSSEEvent(data: string): Message {
  return decode(data);
}

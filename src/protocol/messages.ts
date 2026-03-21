import { nanoid } from "nanoid";
import { HarnessError } from "../shared/errors.js";
import type {
  Origin,
  CapabilityRequest,
  CapabilityReady,
  DataMessage,
  StateSync,
  Negotiate,
  ProcessDeclaration,
} from "../shared/types.js";

export function createCapabilityRequest(
  from: Origin,
  description: string,
  schema?: unknown,
): CapabilityRequest {
  const msg: CapabilityRequest = {
    type: "capability-request",
    id: nanoid(),
    from,
    description,
    timestamp: Date.now(),
  };
  if (schema !== undefined) {
    msg.schema = schema;
  }
  return msg;
}

export function createCapabilityReady(
  from: Origin,
  ref: string,
  endpoint: string,
  meta?: Record<string, unknown>,
): CapabilityReady {
  const msg: CapabilityReady = {
    type: "capability-ready",
    id: nanoid(),
    from,
    ref,
    endpoint,
    timestamp: Date.now(),
  };
  if (meta !== undefined) {
    msg.meta = meta;
  }
  return msg;
}

const CHANNEL_RE = /^[a-zA-Z0-9\-_\/]+$/;

export function validateChannel(channel: string): void {
  if (!channel || channel.length === 0) {
    throw new HarnessError("INVALID_MESSAGE", "channel must not be empty");
  }
  if (channel.length > 128) {
    throw new HarnessError(
      "INVALID_MESSAGE",
      "channel must not exceed 128 characters",
    );
  }
  if (!CHANNEL_RE.test(channel)) {
    throw new HarnessError(
      "INVALID_MESSAGE",
      "channel may only contain letters, digits, -, _, /",
    );
  }
}

export function createDataMessage(
  from: Origin,
  channel: string,
  payload: unknown,
): DataMessage {
  validateChannel(channel);
  return {
    type: "data",
    id: nanoid(),
    from,
    channel,
    payload,
    timestamp: Date.now(),
  };
}

export function createStateSync(
  from: Origin,
  version: string,
  processes: ProcessDeclaration[],
  health: "ok" | "degraded" | "error",
): StateSync {
  return {
    type: "state-sync",
    id: nanoid(),
    from,
    version,
    processes,
    health,
    timestamp: Date.now(),
  };
}

export function createNegotiate(
  from: Origin,
  ref: string,
  content: string,
): Negotiate {
  return {
    type: "negotiate",
    id: nanoid(),
    from,
    ref,
    content,
    timestamp: Date.now(),
  };
}

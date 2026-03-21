import type {
  CapabilityRequest,
  CapabilityReady,
  DataMessage,
  StateSync,
  Negotiate,
  Manifest,
  ProcessDeclaration,
} from "../../src/shared/types.js";

export function makeCapabilityRequest(
  overrides?: Partial<CapabilityRequest>,
): CapabilityRequest {
  return {
    type: "capability-request",
    id: "test-cr-001",
    from: "client",
    description: "test capability",
    timestamp: 1700000000000,
    ...overrides,
  };
}

export function makeCapabilityReady(
  overrides?: Partial<CapabilityReady>,
): CapabilityReady {
  return {
    type: "capability-ready",
    id: "test-cready-001",
    from: "server",
    ref: "test-cr-001",
    endpoint: "/api/test",
    timestamp: 1700000000000,
    ...overrides,
  };
}

export function makeDataMessage(
  overrides?: Partial<DataMessage>,
): DataMessage {
  return {
    type: "data",
    id: "test-data-001",
    from: "client",
    channel: "test-channel",
    payload: { key: "value" },
    timestamp: 1700000000000,
    ...overrides,
  };
}

export function makeStateSync(
  overrides?: Partial<StateSync>,
): StateSync {
  return {
    type: "state-sync",
    id: "test-ss-001",
    from: "client",
    version: "v001",
    processes: [],
    health: "ok",
    timestamp: 1700000000000,
    ...overrides,
  };
}

export function makeNegotiate(
  overrides?: Partial<Negotiate>,
): Negotiate {
  return {
    type: "negotiate",
    id: "test-neg-001",
    from: "client",
    ref: "test-cr-001",
    content: "let's discuss",
    timestamp: 1700000000000,
    ...overrides,
  };
}

export function makeProcessDeclaration(
  overrides?: Partial<ProcessDeclaration>,
): ProcessDeclaration {
  return {
    name: "test-process",
    entry: "test.js",
    type: "persistent",
    ...overrides,
  };
}

export function makeManifest(
  overrides?: Partial<Manifest>,
): Manifest {
  return {
    version: "v001",
    timestamp: 1700000000000,
    server: {
      commit: "abc123",
      processes: [],
    },
    client: {
      commit: "def456",
      processes: [],
    },
    ...overrides,
  };
}

export const INVALID_MESSAGES = {
  missingType: '{"id":"abc","from":"client"}',
  unknownType:
    '{"type":"unknown","id":"abc","from":"client","timestamp":0}',
  missingId:
    '{"type":"data","from":"client","channel":"test","payload":{},"timestamp":0}',
  invalidFrom:
    '{"type":"data","id":"abc","from":"mars","channel":"test","payload":{},"timestamp":0}',
  notJson: "not json at all",
  emptyString: "",
};

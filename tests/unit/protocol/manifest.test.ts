import { describe, it, expect } from "vitest";
import {
  createManifest,
  serializeManifest,
  deserializeManifest,
  canRollback,
} from "../../../src/protocol/manifest.js";
import { makeManifest } from "../../helpers/fixtures.js";

describe("createManifest", () => {
  const server = { commit: "abc123", processes: [] };
  const client = { commit: "def456", processes: [] };

  it("无 previousVersion 时 version 为 v001", () => {
    const m = createManifest(server, client);
    expect(m.version).toBe("v001");
  });

  it("previousVersion 为 v006 时 version 为 v007", () => {
    const m = createManifest(server, client, "v006");
    expect(m.version).toBe("v007");
  });

  it("rollback_to 等于 previousVersion", () => {
    const m = createManifest(server, client, "v003");
    expect(m.rollback_to).toBe("v003");
  });

  it("无 previousVersion 时 rollback_to 不存在", () => {
    const m = createManifest(server, client);
    expect(m.rollback_to).toBeUndefined();
  });

  it("timestamp 是合理的 unix 毫秒时间戳", () => {
    const m = createManifest(server, client);
    const now = Date.now();
    expect(m.timestamp).toBeGreaterThan(now - 5000);
    expect(m.timestamp).toBeLessThanOrEqual(now);
  });
});

describe("serializeManifest / deserializeManifest 往返", () => {
  it("序列化后反序列化得到相同结构", () => {
    const m = makeManifest({ rollback_to: "v000" });
    const serialized = serializeManifest(m);
    const deserialized = deserializeManifest(serialized);
    expect(deserialized).toEqual(m);
  });

  it("序列化输出有 2-space 缩进", () => {
    const m = makeManifest();
    const serialized = serializeManifest(m);
    expect(serialized).toContain("  ");
    expect(serialized).toContain("\n");
  });
});

describe("canRollback", () => {
  it("有 rollback_to 时返回 true", () => {
    const m = makeManifest({ rollback_to: "v001" });
    expect(canRollback(m)).toBe(true);
  });

  it("无 rollback_to 时返回 false", () => {
    const m = makeManifest();
    expect(canRollback(m)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  createManifest,
  serializeManifest,
  deserializeManifest,
  canRollback,
} from "../../src/protocol/manifest.js";
import { createStateSync } from "../../src/protocol/messages.js";

describe("Manifest 版本同步", () => {
  it("两端 state-sync 中的 version 一致", () => {
    const manifest = createManifest(
      { commit: "aaa", processes: [] },
      { commit: "bbb", processes: [] },
    );

    const serverSync = createStateSync(
      "server",
      manifest.version,
      [],
      "ok",
    );
    const clientSync = createStateSync(
      "client",
      manifest.version,
      [],
      "ok",
    );

    expect(serverSync.version).toBe(clientSync.version);
    expect(serverSync.version).toBe("v001");
  });

  it("server 端版本更新后，client 通过 state-sync 感知到", () => {
    const m1 = createManifest(
      { commit: "aaa", processes: [] },
      { commit: "bbb", processes: [] },
    );
    const m2 = createManifest(
      { commit: "ccc", processes: [] },
      { commit: "ddd", processes: [] },
      m1.version,
    );

    // Server broadcasts new version
    const serverSync = createStateSync(
      "server",
      m2.version,
      [],
      "ok",
    );

    // Client receives and updates
    expect(serverSync.version).toBe("v002");

    // Client confirms
    const clientSync = createStateSync(
      "client",
      serverSync.version,
      [],
      "ok",
    );
    expect(clientSync.version).toBe("v002");
  });

  it("manifest 版本号递增", () => {
    const m1 = createManifest(
      { commit: "a", processes: [] },
      { commit: "b", processes: [] },
    );
    expect(m1.version).toBe("v001");

    const m2 = createManifest(
      { commit: "c", processes: [] },
      { commit: "d", processes: [] },
      m1.version,
    );
    expect(m2.version).toBe("v002");

    const m3 = createManifest(
      { commit: "e", processes: [] },
      { commit: "f", processes: [] },
      m2.version,
    );
    expect(m3.version).toBe("v003");
  });

  it("回滚后两端 version 退回到目标版本", () => {
    const m1 = createManifest(
      { commit: "a", processes: [] },
      { commit: "b", processes: [] },
    );
    const m2 = createManifest(
      { commit: "c", processes: [] },
      { commit: "d", processes: [] },
      m1.version,
    );

    expect(canRollback(m2)).toBe(true);
    expect(m2.rollback_to).toBe("v001");

    // Simulate rollback: restore m1's state
    const serialized = serializeManifest(m1);
    const restored = deserializeManifest(serialized);
    expect(restored.version).toBe("v001");

    // Both sides sync to rolled-back version
    const serverSync = createStateSync(
      "server",
      restored.version,
      [],
      "ok",
    );
    const clientSync = createStateSync(
      "client",
      restored.version,
      [],
      "ok",
    );
    expect(serverSync.version).toBe("v001");
    expect(clientSync.version).toBe("v001");
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ProcessManager } from "../../../src/client/process-manager.js";
import type { ProcessDeclaration } from "../../../src/shared/types.js";

let tmpDir: string;
let pm: ProcessManager;

// Helper: create a simple script in tmpDir
function createScript(name: string, code: string): string {
  const file = path.join(tmpDir, name);
  fs.writeFileSync(file, code);
  return name;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-test-"));
  pm = new ProcessManager(tmpDir);
});

afterEach(async () => {
  await pm.stopAll();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ProcessManager", () => {
  it("start 启动进程并返回 running 状态", async () => {
    const entry = createScript(
      "long.js",
      "setInterval(() => {}, 1000);",
    );
    const decl: ProcessDeclaration = {
      name: "long",
      entry,
      type: "persistent",
    };
    const result = await pm.start(decl);
    expect(result.status).toBe("running");
    expect(result.name).toBe("long");
    expect(result.pid).toBeGreaterThan(0);
  });

  it("stop 终止进程", async () => {
    const entry = createScript(
      "long2.js",
      "setInterval(() => {}, 1000);",
    );
    await pm.start({ name: "long2", entry, type: "persistent" });
    await pm.stop("long2");
    const p = pm.get("long2");
    expect(p?.status).toBe("stopped");
  });

  it("restart 先 stop 再 start", async () => {
    const entry = createScript(
      "long3.js",
      "setInterval(() => {}, 1000);",
    );
    await pm.start({ name: "long3", entry, type: "persistent" });
    const restarted = await pm.restart("long3");
    expect(restarted.status).toBe("running");
  });

  it("stopAll 终止所有进程", async () => {
    createScript("a.js", "setInterval(() => {}, 1000);");
    createScript("b.js", "setInterval(() => {}, 1000);");
    await pm.start({ name: "a", entry: "a.js", type: "persistent" });
    await pm.start({ name: "b", entry: "b.js", type: "persistent" });
    await pm.stopAll();
    const all = pm.list();
    expect(all.every((p) => p.status === "stopped")).toBe(true);
  });

  it("list 返回当前所有进程状态", async () => {
    createScript("c.js", "setInterval(() => {}, 1000);");
    await pm.start({ name: "c", entry: "c.js", type: "persistent" });
    const all = pm.list();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("c");
  });

  it("进程自行退出后状态变为 stopped", async () => {
    const entry = createScript("short.js", "process.exit(0);");
    await pm.start({ name: "short", entry, type: "persistent" });
    // Wait for the process to exit
    await new Promise((r) => setTimeout(r, 500));
    const p = pm.get("short");
    expect(p?.status).toBe("stopped");
  });

  it("进程 crash 后自动重启，最多 3 次", async () => {
    const entry = createScript("crash.js", "process.exit(1);");
    await pm.start({ name: "crash", entry, type: "persistent" });
    // Wait for crash + restarts
    await new Promise((r) => setTimeout(r, 2000));
    const p = pm.get("crash");
    expect(p?.restarts).toBe(3);
  });

  it("3 次 crash 后状态变为 crashed，不再重试", async () => {
    const entry = createScript("crash2.js", "process.exit(1);");
    await pm.start({ name: "crash2", entry, type: "persistent" });
    await new Promise((r) => setTimeout(r, 2000));
    const p = pm.get("crash2");
    expect(p?.status).toBe("crashed");
    expect(p?.restarts).toBe(3);
  });

  it("syncFromManifest 启动缺失的进程", async () => {
    createScript("new.js", "setInterval(() => {}, 1000);");
    await pm.syncFromManifest([
      { name: "new", entry: "new.js", type: "persistent" },
    ]);
    const p = pm.get("new");
    expect(p?.status).toBe("running");
  });

  it("syncFromManifest 停止多余的进程", async () => {
    createScript("extra.js", "setInterval(() => {}, 1000);");
    await pm.start({
      name: "extra",
      entry: "extra.js",
      type: "persistent",
    });
    await pm.syncFromManifest([]);
    // Process should be stopped and removed
    const p = pm.get("extra");
    expect(p).toBeNull();
  });

  it("syncFromManifest entry 变更时重启对应进程", async () => {
    createScript("v1.js", "setInterval(() => {}, 1000);");
    createScript("v2.js", "setInterval(() => {}, 1000);");
    await pm.start({ name: "svc", entry: "v1.js", type: "persistent" });
    await pm.syncFromManifest([
      { name: "svc", entry: "v2.js", type: "persistent" },
    ]);
    const p = pm.get("svc");
    expect(p?.status).toBe("running");
    expect(p?.entry).toBe("v2.js");
  });
});

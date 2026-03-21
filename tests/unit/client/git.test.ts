import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { GitOps } from "../../../src/client/git.js";
import { HarnessError } from "../../../src/shared/errors.js";

let tmpDir: string;
let git: GitOps;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-test-"));
  git = new GitOps(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("GitOps", () => {
  it("init 在空目录创建 git repo", async () => {
    await git.init();
    expect(fs.existsSync(path.join(tmpDir, ".git"))).toBe(true);
  });

  it("init 在已有 repo 时不报错", async () => {
    await git.init();
    await git.init(); // second init should not throw
  });

  it("commit 创建 commit 并返回 hash", async () => {
    await git.init();
    fs.writeFileSync(path.join(tmpDir, "file.txt"), "hello");
    const hash = await git.commit("initial");
    expect(hash).toMatch(/^[a-f0-9]{40}$/);
  });

  it("空 diff 时 commit 不创建新 commit，返回当前 hash", async () => {
    await git.init();
    fs.writeFileSync(path.join(tmpDir, "file.txt"), "hello");
    const hash1 = await git.commit("first");
    const hash2 = await git.commit("second");
    expect(hash1).toBe(hash2);
  });

  it("getCurrentCommit 返回 HEAD hash", async () => {
    await git.init();
    fs.writeFileSync(path.join(tmpDir, "file.txt"), "hello");
    await git.commit("initial");
    const hash = await git.getCurrentCommit();
    expect(hash).toMatch(/^[a-f0-9]{40}$/);
  });

  it("getCurrentCommit 在空 repo 返回 'no-commits'", async () => {
    await git.init();
    const result = await git.getCurrentCommit();
    expect(result).toBe("no-commits");
  });

  it("checkout 切换到指定 commit", async () => {
    await git.init();
    fs.writeFileSync(path.join(tmpDir, "file.txt"), "v1");
    const hash1 = await git.commit("v1");
    fs.writeFileSync(path.join(tmpDir, "file.txt"), "v2");
    await git.commit("v2");
    await git.checkout(hash1);
    const content = fs.readFileSync(path.join(tmpDir, "file.txt"), "utf-8");
    expect(content).toBe("v1");
  });

  it("log 返回最近 n 条 commit", async () => {
    await git.init();
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "a");
    await git.commit("first");
    fs.writeFileSync(path.join(tmpDir, "b.txt"), "b");
    await git.commit("second");
    const logs = await git.log(2);
    expect(logs).toHaveLength(2);
    expect(logs[0].message).toBe("second");
    expect(logs[1].message).toBe("first");
    expect(logs[0].hash).toMatch(/^[a-f0-9]{40}$/);
  });

  it("diff 返回两个 commit 之间的差异", async () => {
    await git.init();
    fs.writeFileSync(path.join(tmpDir, "file.txt"), "v1");
    const hash1 = await git.commit("v1");
    fs.writeFileSync(path.join(tmpDir, "file.txt"), "v2");
    const hash2 = await git.commit("v2");
    const d = await git.diff(hash1, hash2);
    expect(d).toContain("-v1");
    expect(d).toContain("+v2");
  });

  it("git 命令失败时抛出 HarnessError GIT_FAILED", async () => {
    try {
      await git.log(); // no repo yet — log will fail
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(HarnessError);
      expect((e as HarnessError).code).toBe("GIT_FAILED");
    }
  });
});

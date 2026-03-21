import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  detectAgents,
  installSkill,
  uninstallSkill,
} from "../../../src/pi/install.js";

let tmpHome: string;
let origHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-"));
  origHome = process.env.HOME!;
  process.env.HOME = tmpHome;
});

afterEach(() => {
  process.env.HOME = origHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("detectAgents", () => {
  it("~/.pi/agent 存在时 pi=true", async () => {
    fs.mkdirSync(path.join(tmpHome, ".pi", "agent"), {
      recursive: true,
    });
    const result = await detectAgents();
    expect(result.pi).toBe(true);
  });

  it("~/.claude 存在时 claudeCode=true", async () => {
    fs.mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
    const result = await detectAgents();
    expect(result.claudeCode).toBe(true);
  });

  it("两者都不存在时都 false", async () => {
    const result = await detectAgents();
    expect(result.pi).toBe(false);
    expect(result.claudeCode).toBe(false);
  });
});

describe("installSkill", () => {
  it("target=pi 时创建 ~/.pi/agent/skills/sparkco/SKILL.md", async () => {
    fs.mkdirSync(path.join(tmpHome, ".pi", "agent"), {
      recursive: true,
    });
    await installSkill("pi");
    const skillPath = path.join(
      tmpHome,
      ".pi",
      "agent",
      "skills",
      "sparkco",
      "SKILL.md",
    );
    expect(fs.existsSync(skillPath)).toBe(true);
  });

  it("target=claude-code 时创建 ~/.claude/skills/sparkco/SKILL.md", async () => {
    fs.mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
    await installSkill("claude-code");
    const skillPath = path.join(
      tmpHome,
      ".claude",
      "skills",
      "sparkco",
      "SKILL.md",
    );
    expect(fs.existsSync(skillPath)).toBe(true);
  });

  it("target=both 时两个都创建", async () => {
    fs.mkdirSync(path.join(tmpHome, ".pi", "agent"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
    await installSkill("both");
    expect(
      fs.existsSync(
        path.join(
          tmpHome,
          ".pi",
          "agent",
          "skills",
          "sparkco",
          "SKILL.md",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          tmpHome,
          ".claude",
          "skills",
          "sparkco",
          "SKILL.md",
        ),
      ),
    ).toBe(true);
  });

  it("SKILL.md 内容包含所有命令文档", async () => {
    await installSkill("pi");
    const content = fs.readFileSync(
      path.join(
        tmpHome,
        ".pi",
        "agent",
        "skills",
        "sparkco",
        "SKILL.md",
      ),
      "utf-8",
    );
    expect(content).toContain("sparkco status");
    expect(content).toContain("sparkco send");
    expect(content).toContain("sparkco inbox");
    expect(content).toContain("sparkco routes");
    expect(content).toContain("sparkco deploy");
    expect(content).toContain("sparkco secret");
  });
});

describe("uninstallSkill", () => {
  it("删除两个位置的 skill 目录", async () => {
    await installSkill("both");
    await uninstallSkill();
    expect(
      fs.existsSync(
        path.join(
          tmpHome,
          ".pi",
          "agent",
          "skills",
          "sparkco",
        ),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(tmpHome, ".claude", "skills", "sparkco"),
      ),
    ).toBe(false);
  });

  it("目录不存在时不报错", async () => {
    // Should not throw
    await uninstallSkill();
  });
});

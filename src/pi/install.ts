import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type SkillTarget = "pi" | "claude-code" | "both";

function home(): string {
  return process.env.HOME || "~";
}

function piSkillDir(): string {
  return path.join(home(), ".pi", "agent", "skills", "sparkco");
}

function claudeSkillDir(): string {
  return path.join(home(), ".claude", "skills", "sparkco");
}

export async function detectAgents(): Promise<{
  pi: boolean;
  claudeCode: boolean;
}> {
  const pi = fs.existsSync(path.join(home(), ".pi", "agent"));
  const claudeCode = fs.existsSync(path.join(home(), ".claude"));
  return { pi, claudeCode };
}

function getSkillContent(): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const skillPath = path.join(thisDir, "skill.md");
  if (fs.existsSync(skillPath)) {
    return fs.readFileSync(skillPath, "utf-8");
  }
  const fallbackPath = path.resolve("src/pi/skill.md");
  if (fs.existsSync(fallbackPath)) {
    return fs.readFileSync(fallbackPath, "utf-8");
  }
  throw new Error("skill.md not found");
}

export async function installSkill(target: SkillTarget): Promise<void> {
  const content = getSkillContent();

  if (target === "pi" || target === "both") {
    const dir = piSkillDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), content);
  }

  if (target === "claude-code" || target === "both") {
    const dir = claudeSkillDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), content);
  }
}

export async function uninstallSkill(): Promise<void> {
  for (const dir of [piSkillDir(), claudeSkillDir()]) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

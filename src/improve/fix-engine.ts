import * as fs from "node:fs";
import * as path from "node:path";
import { execa } from "execa";
import { nanoid } from "nanoid";
import type { Issue, Fix } from "../shared/types.js";
import { createDataMessage, createNegotiate } from "../protocol/messages.js";
import { GitOps } from "../client/git.js";

export type FixEngineConfig = {
  repoDir: string;
  workDir: string;
  maxAttempts: number;
  piTimeout: number; // ms
};

export function buildFixPrompt(issue: Issue, attempt: number, repoDir: string): string {
  let prompt = `You are a maintainer of the sparkco-harness project at ${repoDir}.

An automated testing system found this issue:

Type: ${issue.type}
Severity: ${issue.severity}
Title: ${issue.title}

Description:
${issue.description}

Reproduction:
${issue.reproduction}
`;

  if (issue.affected_files?.length) {
    prompt += `\nLikely affected files:\n${issue.affected_files.map((f) => `- ${f}`).join("\n")}\n`;
  }

  prompt += `
Your task:
1. Read relevant source code and understand the root cause
2. Write the minimal fix
3. Add tests if the scenario isn't already covered
4. Don't change existing test expectations
5. Don't add new dependencies
`;

  if (attempt > 1) {
    prompt += `\nNote: This is attempt ${attempt}. Previous attempts failed tests. Re-analyze from scratch.\n`;
  }

  return prompt;
}

export function parseTestOutput(stdout: string): {
  passed: number;
  failed: number;
  new_tests_added: number;
} {
  // Parse vitest output: "Tests  N passed (N)" or "Tests  N failed | N passed (N)"
  const passedMatch = stdout.match(/(\d+) passed/);
  const failedMatch = stdout.match(/(\d+) failed/);
  return {
    passed: passedMatch ? parseInt(passedMatch[1], 10) : 0,
    failed: failedMatch ? parseInt(failedMatch[1], 10) : 0,
    new_tests_added: 0, // Would need diff to calculate
  };
}

export async function attemptFix(
  issue: Issue,
  config: FixEngineConfig,
  attempt: number = 1,
  log?: (level: string, msg: string, data?: unknown) => void,
): Promise<Fix> {
  const logFn = log ?? (() => {});
  const fix: Fix = {
    id: `fix-${nanoid(8)}`,
    issue_ref: issue.id,
    status: "attempting",
    diff_summary: "",
    files_changed: [],
    attempts: attempt,
  };

  logFn("info", "attempting fix", {
    issue_id: issue.id,
    attempt,
    title: issue.title,
  });

  const prompt = buildFixPrompt(issue, attempt, config.repoDir);

  try {
    // 1. Run pi to fix
    await execa("pi", ["-p", prompt], {
      cwd: config.repoDir,
      timeout: config.piTimeout,
    });

    fix.status = "testing";

    // 2. Run tests
    const testResult = await execa("npm", ["test"], {
      cwd: config.repoDir,
      timeout: 120000,
      reject: false,
    });

    fix.test_result = parseTestOutput(testResult.stdout);

    if (fix.test_result.failed === 0 && testResult.exitCode === 0) {
      // 3. All tests pass → commit
      fix.status = "passed";
      const git = new GitOps(config.repoDir);
      fix.commit_hash = await git.commit(
        `fix(${issue.type}): ${issue.title}\n\nIssue: ${issue.id}\nDiscovered by: ${issue.discovered_by}`,
      );
      fix.diff_summary = `Fixed ${issue.title}`;

      logFn("info", "fix passed", {
        issue_id: issue.id,
        commit: fix.commit_hash,
      });
    } else {
      fix.status = "failed";
      logFn("warn", "fix failed tests", {
        issue_id: issue.id,
        failed: fix.test_result.failed,
      });

      // Revert changes
      await execa("git", ["checkout", "."], {
        cwd: config.repoDir,
      }).catch(() => {});

      if (attempt < config.maxAttempts) {
        return attemptFix(issue, config, attempt + 1, log);
      } else {
        fix.status = "abandoned";
      }
    }
  } catch (err) {
    fix.status = "failed";
    logFn("error", "fix attempt error", {
      issue_id: issue.id,
      error: (err as Error).message,
    });

    await execa("git", ["checkout", "."], {
      cwd: config.repoDir,
    }).catch(() => {});

    if (attempt < config.maxAttempts) {
      return attemptFix(issue, config, attempt + 1, log);
    } else {
      fix.status = "abandoned";
    }
  }

  return fix;
}

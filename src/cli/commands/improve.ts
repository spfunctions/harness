import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig, getSparkcoDir } from "../config.js";
import * as output from "../output.js";
import { DEFAULT_LIMITS } from "../../improve/safety.js";
import type { DashboardState, Issue, Fix } from "../../shared/types.js";

function issuesDir(): string {
  return path.join(getSparkcoDir(), "issues");
}

function fixesDir(): string {
  return path.join(getSparkcoDir(), "fixes");
}

async function fetchDashboard(): Promise<DashboardState | null> {
  try {
    const config = loadConfig();
    const res = await fetch(`${config.server.workerUrl}/improve/dashboard`, {
      headers: {
        Authorization: `Bearer ${config.session.token}`,
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as DashboardState;
  } catch {
    // Fallback to local
    const localPath = path.join(getSparkcoDir(), "improve-dashboard.json");
    if (fs.existsSync(localPath)) {
      return JSON.parse(fs.readFileSync(localPath, "utf-8"));
    }
    return null;
  }
}

function getLocalDashboard(): DashboardState {
  const localPath = path.join(getSparkcoDir(), "improve-dashboard.json");
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, "utf-8"));
  }
  return {
    cycle_count: 0,
    issues_found: 0,
    issues_fixed: 0,
    issues_abandoned: 0,
    recent_fixes: [],
    recent_issues: [],
    llm_calls_today: 0,
    llm_tokens_today: 0,
    last_cycle_at: 0,
    health: "paused",
  };
}

function saveLocalDashboard(dashboard: DashboardState): void {
  const localPath = path.join(getSparkcoDir(), "improve-dashboard.json");
  fs.writeFileSync(localPath, JSON.stringify(dashboard, null, 2));
}

export async function improveCommand(
  action?: string,
  arg1?: string,
  arg2?: string,
): Promise<void> {
  switch (action) {
    case "status":
    case undefined:
    case "":
      await showStatus();
      break;
    case "issues":
      await listIssues(arg1); // arg1 = --status filter value
      break;
    case "issue":
      await showIssue(arg1); // arg1 = issue id
      break;
    case "fixes":
      await listFixes();
      break;
    case "pause":
      await setPaused(true);
      break;
    case "resume":
      await setPaused(false);
      break;
    case "config":
      if (arg1 === "set" && arg2) {
        await setConfig(arg2);
      } else {
        showConfig();
      }
      break;
    default:
      output.error(
        `Unknown action: ${action}. Use: status, issues, issue, fixes, pause, resume, config`,
      );
  }
}

async function showStatus(): Promise<void> {
  const dashboard = getLocalDashboard();

  const data = {
    health: dashboard.health,
    cycle: dashboard.cycle_count,
    found: dashboard.issues_found,
    fixed: dashboard.issues_fixed,
    abandoned: dashboard.issues_abandoned,
    pending: dashboard.issues_found - dashboard.issues_fixed - dashboard.issues_abandoned,
    llm_today: dashboard.llm_calls_today,
    llm_limit: DEFAULT_LIMITS.maxDailyLLMCalls,
    current: dashboard.current_issue?.title ?? null,
  };

  output.print(data, () => {
    const pct = dashboard.issues_found > 0
      ? Math.round((dashboard.issues_fixed / dashboard.issues_found) * 100)
      : 0;
    return [
      "",
      "  ┌────────────────────────────────┐",
      "  │ Self-Improvement Engine        │",
      "  ├────────────────────────────────┤",
      `  │ Status:     ${dashboard.health === "running" ? "●" : "○"} ${dashboard.health}`.padEnd(35) + "│",
      `  │ Cycle:      #${dashboard.cycle_count}`.padEnd(35) + "│",
      `  │ Found:      ${dashboard.issues_found} issues`.padEnd(35) + "│",
      `  │ Fixed:      ${dashboard.issues_fixed} (${pct}%)`.padEnd(35) + "│",
      `  │ Abandoned:  ${dashboard.issues_abandoned}`.padEnd(35) + "│",
      `  │ Pending:    ${data.pending}`.padEnd(35) + "│",
      `  │ LLM today:  ${dashboard.llm_calls_today}/${DEFAULT_LIMITS.maxDailyLLMCalls}`.padEnd(35) + "│",
      dashboard.current_issue
        ? `  │ Current:    ${dashboard.current_issue.title.slice(0, 20)}`.padEnd(35) + "│"
        : `  │ Current:    idle`.padEnd(35) + "│",
      "  └────────────────────────────────┘",
      "",
    ].join("\n");
  });
}

async function listIssues(statusFilter?: string): Promise<void> {
  const dir = issuesDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    output.print({ issues: [] }, () => "No issues found.");
    return;
  }

  const rows: string[][] = [];
  for (const file of files) {
    try {
      const issue = JSON.parse(
        fs.readFileSync(path.join(dir, file), "utf-8"),
      ) as Issue;
      // Check for corresponding fix
      const fixDir = fixesDir();
      let status = "pending";
      if (fs.existsSync(fixDir)) {
        const fixFiles = fs.readdirSync(fixDir).filter((f) => f.endsWith(".json"));
        for (const ff of fixFiles) {
          const fix = JSON.parse(
            fs.readFileSync(path.join(fixDir, ff), "utf-8"),
          ) as Fix;
          if (fix.issue_ref === issue.id) {
            status = fix.status;
            break;
          }
        }
      }
      if (statusFilter && status !== statusFilter) continue;
      rows.push([
        issue.id,
        issue.type,
        issue.severity,
        issue.title.slice(0, 40),
        status,
      ]);
    } catch {
      // Skip invalid files
    }
  }

  output.table(["id", "type", "severity", "title", "status"], rows);
}

async function showIssue(id?: string): Promise<void> {
  if (!id) {
    output.error("Usage: sparkco improve issue <id>");
    return;
  }
  const filePath = path.join(issuesDir(), `${id}.json`);
  if (!fs.existsSync(filePath)) {
    output.error(`Issue ${id} not found.`);
    return;
  }
  const issue = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  output.print(issue, (data) => JSON.stringify(data, null, 2));
}

async function listFixes(): Promise<void> {
  const dir = fixesDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    output.print({ fixes: [] }, () => "No fixes yet.");
    return;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    output.print({ fixes: [] }, () => "No fixes yet.");
    return;
  }

  const rows: string[][] = [];
  for (const file of files.slice(-10)) {
    try {
      const fix = JSON.parse(
        fs.readFileSync(path.join(dir, file), "utf-8"),
      ) as Fix;
      rows.push([
        fix.id,
        fix.issue_ref,
        fix.status,
        String(fix.attempts),
        fix.commit_hash?.slice(0, 7) ?? "-",
      ]);
    } catch {
      // Skip
    }
  }
  output.table(["id", "issue", "status", "attempts", "commit"], rows);
}

async function setPaused(paused: boolean): Promise<void> {
  const dashboard = getLocalDashboard();
  dashboard.health = paused ? "paused" : "running";
  saveLocalDashboard(dashboard);
  output.success(
    paused
      ? "Self-improvement engine paused."
      : "Self-improvement engine resumed.",
  );
}

function showConfig(): void {
  output.print(DEFAULT_LIMITS, (data) => {
    const d = data as typeof DEFAULT_LIMITS;
    return [
      `  Max issues/hour:     ${d.maxIssuesPerHour}`,
      `  Max fix attempts:    ${d.maxFixAttemptsPerIssue}`,
      `  Max concurrent:      ${d.maxConcurrentFixes}`,
      `  Max daily LLM calls: ${d.maxDailyLLMCalls}`,
      `  Cooldown on fail:    ${d.cooldownAfterFailMs / 60000} min`,
    ].join("\n");
  });
}

async function setConfig(_setting: string): Promise<void> {
  output.warn("Config modification not yet implemented. Edit ~/.sparkco/improve-dashboard.json directly.");
}

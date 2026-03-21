import { loadConfig, getSparkcoDir } from "../config.js";
import * as output from "../output.js";
import { CloudflareStorage } from "../../storage/cloudflare-client.js";

export async function serverCommand(
  action?: string,
  arg1?: string,
): Promise<void> {
  switch (action) {
    case "status":
    case undefined:
    case "":
      await showServerStatus();
      break;
    case "logs":
      await showServerLogs(arg1 === "--tail");
      break;
    case "tasks":
      await showTasks();
      break;
    default:
      output.error(
        `Unknown action: ${action}. Use: status, logs, tasks`,
      );
  }
}

async function showServerStatus(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch {
    output.error("Not initialized. Run 'sparkco init' first.");
    return;
  }

  const storage = new CloudflareStorage(
    config.server.workerUrl,
    config.session.token,
  );

  let serverState: Record<string, unknown> = { connected: false };
  try {
    const state = await storage.kvGet("server-state");
    if (state && typeof state === "object") {
      serverState = { connected: true, ...(state as Record<string, unknown>) };
    }
  } catch {
    // Server may not have reported state yet
  }

  const data = {
    workerUrl: config.server.workerUrl,
    workerName: config.server.workerName,
    serverConnected: serverState.connected ?? false,
    ...(serverState as object),
  };

  output.print(data, () => {
    const lines = [
      "",
      "  ┌────────────────────────────────┐",
      "  │ Server Runtime                 │",
      "  ├────────────────────────────────┤",
      `  │ Worker:  ${config.server.workerName}`.padEnd(35) + "│",
      `  │ URL:     ${config.server.workerUrl}`.padEnd(35) + "│",
      `  │ Server:  ${serverState.connected ? "● connected" : "○ not connected"}`.padEnd(35) + "│",
      "  └────────────────────────────────┘",
      "",
    ];
    return lines.join("\n");
  });
}

async function showServerLogs(tail: boolean): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch {
    output.error("Not initialized.");
    return;
  }

  const storage = new CloudflareStorage(
    config.server.workerUrl,
    config.session.token,
  );

  try {
    const logs = await storage.kvGet("server-logs");
    if (!logs) {
      output.print(null, () => "No server logs available.");
      return;
    }
    process.stdout.write(String(logs) + "\n");
  } catch (err) {
    output.error(
      `Failed to fetch server logs: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function showTasks(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch {
    output.error("Not initialized.");
    return;
  }

  const storage = new CloudflareStorage(
    config.server.workerUrl,
    config.session.token,
  );

  try {
    const tasks = await storage.kvGet("server-tasks");
    if (!tasks || !Array.isArray(tasks)) {
      output.print(null, () => "No task data available. Is the server daemon running?");
      return;
    }
    const rows = (tasks as Array<{ name: string; interval: number; lastRun?: number; enabled: boolean }>).map((t) => [
      t.name,
      `${Math.round(t.interval / 60000)}m`,
      t.lastRun ? `${Math.round((Date.now() - t.lastRun) / 60000)}m ago` : "never",
      t.enabled ? "enabled" : "disabled",
    ]);
    output.table(["name", "interval", "last run", "status"], rows);
  } catch {
    output.print(null, () => "No task data available.");
  }
}

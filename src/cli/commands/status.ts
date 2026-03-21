import {
  loadConfig,
  getDaemonPid,
  getSparkcoDir,
} from "../config.js";
import * as output from "../output.js";
import * as fs from "node:fs";
import * as path from "node:path";

export async function statusCommand(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch {
    output.error("Not initialized. Run 'sparkco init' first.");
    return;
  }

  const pid = getDaemonPid();
  const daemonStatus = pid ? `running (pid ${pid})` : "stopped";

  const inboxDir = path.join(getSparkcoDir(), "inbox");
  let pendingCount = 0;
  if (fs.existsSync(inboxDir)) {
    pendingCount = fs
      .readdirSync(inboxDir)
      .filter((f) => f.endsWith(".json")).length;
  }

  const routeCount = config.client.routes.length;

  const data = {
    daemon: pid ? "running" : "stopped",
    pid: pid ?? undefined,
    server: config.server.workerUrl,
    version: config.version,
    workerName: config.server.workerName,
    routes: routeCount,
    inbox: pendingCount,
  };

  output.print(data, () => {
    const lines = [
      "",
      "  ┌─────────────────────────────────────────┐",
      "  │  SparkCo Harness v0.1.0                 │",
      "  ├─────────────────────────────────────────┤",
      `  │  Daemon:     ${pid ? "● " + daemonStatus : "○ stopped"}`.padEnd(44) + "│",
      `  │  Server:     ${config.server.workerUrl}`.padEnd(44) + "│",
      `  │  Worker:     ${config.server.workerName}`.padEnd(44) + "│",
      `  │  Routes:     ${routeCount} active`.padEnd(44) + "│",
      `  │  Inbox:      ${pendingCount} pending`.padEnd(44) + "│",
      "  └─────────────────────────────────────────┘",
      "",
    ];
    return lines.join("\n");
  });
}

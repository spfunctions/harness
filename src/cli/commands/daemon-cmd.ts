import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

function findTsx(): string {
  // Resolve relative to this file's location
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const local = path.resolve(thisDir, "../../node_modules/.bin/tsx");
  if (fs.existsSync(local)) return local;
  // Try project root node_modules
  const projectLocal = path.resolve("node_modules/.bin/tsx");
  if (fs.existsSync(projectLocal)) return projectLocal;
  return "tsx"; // fallback to global
}
import {
  loadConfig,
  getDaemonPid,
  writeDaemonPid,
  removeDaemonPid,
  getSparkcoDir,
} from "../config.js";
import * as output from "../output.js";
import { Daemon } from "../../client/daemon.js";

export async function daemonCommand(
  action: string,
  options?: { detached?: boolean; role?: string; workDir?: string; port?: number },
): Promise<void> {
  const role = (options?.role ?? "client") as "client" | "server";
  switch (action) {
    case "start":
      await startDaemon(options?.detached ?? false, role, options?.workDir, options?.port);
      break;
    case "stop":
      await stopDaemon();
      break;
    case "restart":
      await stopDaemon();
      await startDaemon(options?.detached ?? false, role, options?.workDir, options?.port);
      break;
    default:
      output.error(
        `Unknown action: ${action}. Use: start, stop, restart`,
      );
  }
}

async function startDaemon(detached: boolean, role: "client" | "server" = "client", customWorkDir?: string, customPort?: number): Promise<void> {
  const pid = getDaemonPid();
  if (pid) {
    output.error(`Daemon already running (pid ${pid}).`);
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch {
    output.error("Not initialized. Run 'sparkco init' first.");
    return;
  }

  if (detached) {
    // Fork a background process
    const tsxBin = findTsx();
    const child = execa(
      tsxBin,
      [
        path.resolve("src/cli/commands/daemon-cmd.ts"),
      ],
      {
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          SPARKCO_DAEMON_MODE: "1",
          SPARKCO_SERVER_URL: config.server.workerUrl,
          SPARKCO_TOKEN: config.session.token,
        },
      },
    );
    child.unref();
    if (child.pid) {
      writeDaemonPid(child.pid);
      output.success(`Daemon started in background (pid ${child.pid}).`);
    }
    return;
  }

  // Foreground mode
  const workDir = customWorkDir ?? (role === "server" ? path.join(process.env.HOME || "~", "sparkco-server") : getSparkcoDir());
  const daemon = new Daemon({
    role,
    serverUrl: config.server.workerUrl,
    token: config.session.token,
    workDir,
    localPort: customPort ?? config.client.port,
  });

  writeDaemonPid(process.pid);
  output.success(`Daemon started (role=${role}, pid ${process.pid}). Press Ctrl+C to stop.`);

  await daemon.start();

  const shutdown = async () => {
    output.success("Shutting down daemon...");
    await daemon.stop();
    removeDaemonPid();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep running
  await new Promise(() => {});
}

async function stopDaemon(): Promise<void> {
  const pid = getDaemonPid();
  if (!pid) {
    output.error("Daemon not running.");
    return;
  }

  try {
    process.kill(pid, "SIGTERM");

    // Wait up to 5s for graceful shutdown
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        process.kill(pid, 0);
        await new Promise((r) => setTimeout(r, 200));
      } catch {
        // Process exited
        break;
      }
    }

    // Force kill if still running
    try {
      process.kill(pid, 0);
      process.kill(pid, "SIGKILL");
    } catch {
      // Already dead
    }

    removeDaemonPid();
    output.success("Daemon stopped.");
  } catch {
    removeDaemonPid();
    output.success("Daemon stopped (was not running).");
  }
}

// Background daemon mode entry
if (process.env.SPARKCO_DAEMON_MODE === "1") {
  const daemon = new Daemon({
    serverUrl: process.env.SPARKCO_SERVER_URL!,
    token: process.env.SPARKCO_TOKEN!,
    workDir: getSparkcoDir(),
  });
  daemon.start().catch(console.error);
  process.on("SIGTERM", async () => {
    await daemon.stop();
    removeDaemonPid();
    process.exit(0);
  });
}

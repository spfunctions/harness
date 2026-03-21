import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { getSparkcoDir } from "../config.js";
import * as output from "../output.js";

export async function logsCommand(
  name?: string,
  options?: { tail?: boolean; lines?: number },
): Promise<void> {
  const logsDir = path.join(getSparkcoDir(), "logs");

  if (!fs.existsSync(logsDir)) {
    output.print({ logs: [] }, () => "No logs directory found.");
    return;
  }

  if (!name) {
    const files = fs
      .readdirSync(logsDir)
      .filter((f) => f.endsWith(".log"));
    if (files.length === 0) {
      output.print({ logs: [] }, () => "No log files found.");
      return;
    }
    const rows = files.map((f) => {
      const stat = fs.statSync(path.join(logsDir, f));
      return [
        f.replace(".log", ""),
        `${Math.round(stat.size / 1024)}KB`,
        stat.mtime.toISOString(),
      ];
    });
    output.table(["name", "size", "modified"], rows);
    return;
  }

  const logPath = path.join(logsDir, `${name}.log`);
  if (!fs.existsSync(logPath)) {
    output.error(`Log file not found: ${name}`);
    return;
  }

  if (options?.tail) {
    const stream = fs.createReadStream(logPath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream });
    rl.on("line", (line) => process.stdout.write(line + "\n"));
    const watcher = fs.watch(logPath, () => {});
    process.on("SIGINT", () => {
      watcher.close();
      rl.close();
      process.exit(0);
    });
    await new Promise(() => {});
    return;
  }

  const maxLines = options?.lines ?? 50;
  const content = fs.readFileSync(logPath, "utf-8");
  const allLines = content.split("\n");
  const lines = allLines.slice(-maxLines);
  process.stdout.write(lines.join("\n") + "\n");
}

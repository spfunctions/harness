import chalk from "chalk";
import ora, { type Ora } from "ora";

export type OutputFormat = "human" | "json";

let globalFormat: OutputFormat = "human";

export function setFormat(format: OutputFormat): void {
  globalFormat = format;
}

export function getFormat(): OutputFormat {
  return globalFormat;
}

export function print(
  data: unknown,
  humanFormatter?: (data: unknown) => string,
): void {
  if (globalFormat === "json") {
    process.stdout.write(JSON.stringify(data) + "\n");
  } else if (humanFormatter) {
    process.stdout.write(humanFormatter(data) + "\n");
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  }
}

export function table(headers: string[], rows: string[][]): void {
  if (globalFormat === "json") {
    const objects = rows.map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] ?? "";
      });
      return obj;
    });
    process.stdout.write(JSON.stringify(objects) + "\n");
    return;
  }

  // Calculate column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );

  const sep = widths.map((w) => "─".repeat(w + 2)).join("┼");
  const formatRow = (row: string[]) =>
    row.map((cell, i) => ` ${(cell ?? "").padEnd(widths[i])} `).join("│");

  process.stdout.write(formatRow(headers) + "\n");
  process.stdout.write(sep + "\n");
  for (const row of rows) {
    process.stdout.write(formatRow(row) + "\n");
  }
}

export function success(message: string): void {
  if (globalFormat === "json") {
    process.stdout.write(
      JSON.stringify({ status: "ok", message }) + "\n",
    );
  } else {
    process.stdout.write(chalk.green("✓") + " " + message + "\n");
  }
}

export function error(message: string, code?: string): void {
  if (globalFormat === "json") {
    process.stdout.write(
      JSON.stringify({ status: "error", message, code }) + "\n",
    );
  } else {
    process.stdout.write(chalk.red("✗") + " " + message + "\n");
  }
}

export function spinner(message: string): {
  stop: (finalMessage?: string) => void;
} {
  if (globalFormat === "json") {
    return { stop: () => {} };
  }
  const s: Ora = ora(message).start();
  return {
    stop: (finalMessage?: string) => {
      if (finalMessage) {
        s.succeed(finalMessage);
      } else {
        s.stop();
      }
    },
  };
}

export function warn(message: string): void {
  if (globalFormat === "json") {
    process.stdout.write(
      JSON.stringify({ status: "warning", message }) + "\n",
    );
  } else {
    process.stdout.write(chalk.yellow("⚠") + " " + message + "\n");
  }
}

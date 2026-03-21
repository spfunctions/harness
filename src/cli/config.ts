import * as fs from "node:fs";
import * as path from "node:path";

export function getSparkcoDir(): string {
  return path.join(process.env.HOME || "~", ".sparkco");
}

export type SparkcoConfig = {
  version: string;
  server: {
    workerName: string;
    workerUrl: string;
    accountId: string;
    kvNamespaceId: string;
    apiToken?: string;
  };
  client: {
    port: number;
    routes: string[];
  };
  session: {
    token: string;
    createdAt: number;
  };
  pi: {
    skillInstalled: boolean;
    target: string;
  };
  daemon: {
    autoStart: boolean;
    stateSyncInterval: number;
    logRetentionDays: number;
  };
};

export function loadConfig(): SparkcoConfig {
  const cp = path.join(getSparkcoDir(), "config.json");
  if (!fs.existsSync(cp)) {
    throw new Error(
      `Config not found at ${cp}. Run 'sparkco init' first.`,
    );
  }
  return JSON.parse(fs.readFileSync(cp, "utf-8"));
}

export function saveConfig(config: SparkcoConfig): void {
  fs.writeFileSync(
    path.join(getSparkcoDir(), "config.json"),
    JSON.stringify(config, null, 2),
  );
}

export function configExists(): boolean {
  return fs.existsSync(path.join(getSparkcoDir(), "config.json"));
}

export function getDaemonPid(): number | null {
  const pp = path.join(getSparkcoDir(), "daemon.pid");
  if (!fs.existsSync(pp)) return null;
  try {
    const pid = parseInt(fs.readFileSync(pp, "utf-8").trim(), 10);
    try {
      process.kill(pid, 0);
      return pid;
    } catch {
      fs.unlinkSync(pp);
      return null;
    }
  } catch {
    return null;
  }
}

export function writeDaemonPid(pid: number): void {
  fs.writeFileSync(
    path.join(getSparkcoDir(), "daemon.pid"),
    String(pid),
  );
}

export function removeDaemonPid(): void {
  const pp = path.join(getSparkcoDir(), "daemon.pid");
  if (fs.existsSync(pp)) {
    fs.unlinkSync(pp);
  }
}

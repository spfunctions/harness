import { execa, type ResultPromise } from "execa";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ProcessDeclaration } from "../shared/types.js";

export type ManagedProcess = {
  name: string;
  entry: string;
  port?: number;
  status: "running" | "stopped" | "crashed";
  pid?: number;
  restarts: number;
};

const MAX_RESTARTS = 3;

type InternalProcess = {
  decl: ProcessDeclaration;
  proc: ResultPromise | null;
  info: ManagedProcess;
  stopping: boolean;
};

export class ProcessManager {
  private workDir: string;
  private processes = new Map<string, InternalProcess>();
  private logDir: string;

  constructor(workDir: string) {
    this.workDir = workDir;
    this.logDir = path.join(
      process.env.HOME || "~",
      ".sparkco",
      "logs",
    );
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  private spawn(decl: ProcessDeclaration): InternalProcess {
    const logFile = path.join(this.logDir, `${decl.name}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: "a" });

    const proc = execa("node", [decl.entry], {
      cwd: this.workDir,
      detached: false,
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdout?.pipe(logStream);
    proc.stderr?.pipe(logStream);

    const existing = this.processes.get(decl.name);
    const restarts = existing ? existing.info.restarts : 0;

    const internal: InternalProcess = {
      decl,
      proc,
      stopping: false,
      info: {
        name: decl.name,
        entry: decl.entry,
        port: decl.port,
        status: "running",
        pid: proc.pid,
        restarts,
      },
    };

    // Handle process exit
    proc.then(() => {
      const current = this.processes.get(decl.name);
      if (current && current.proc === proc && !current.stopping) {
        current.info.status = "stopped";
        current.proc = null;
      }
    }).catch(() => {
      const current = this.processes.get(decl.name);
      if (!current || current.proc !== proc || current.stopping) {
        return;
      }
      if (current.info.restarts < MAX_RESTARTS) {
        current.info.restarts++;
        const nextRestarts = current.info.restarts;
        const respawned = this.spawn(decl);
        respawned.info.restarts = nextRestarts;
        this.processes.set(decl.name, respawned);
      } else {
        current.info.status = "crashed";
        current.proc = null;
      }
    });

    return internal;
  }

  async start(decl: ProcessDeclaration): Promise<ManagedProcess> {
    const existing = this.processes.get(decl.name);
    if (existing && existing.info.status === "running") {
      return { ...existing.info };
    }

    const internal = this.spawn(decl);
    this.processes.set(decl.name, internal);

    // Give process a moment to start
    await new Promise((r) => setTimeout(r, 50));

    return { ...internal.info };
  }

  async stop(name: string): Promise<void> {
    const internal = this.processes.get(name);
    if (!internal) return;

    internal.stopping = true;

    if (internal.proc) {
      internal.proc.kill("SIGTERM");
      try {
        await internal.proc;
      } catch {
        // Expected — killed process throws
      }
    }
    internal.info.status = "stopped";
    internal.proc = null;
  }

  async restart(name: string): Promise<ManagedProcess> {
    const internal = this.processes.get(name);
    if (!internal) {
      throw new Error(`Process ${name} not found`);
    }
    await this.stop(name);
    return this.start(internal.decl);
  }

  async stopAll(): Promise<void> {
    const names = Array.from(this.processes.keys());
    await Promise.all(names.map((name) => this.stop(name)));
  }

  list(): ManagedProcess[] {
    return Array.from(this.processes.values()).map((p) => ({ ...p.info }));
  }

  get(name: string): ManagedProcess | null {
    const internal = this.processes.get(name);
    return internal ? { ...internal.info } : null;
  }

  async syncFromManifest(processes: ProcessDeclaration[]): Promise<void> {
    const desired = new Map(processes.map((p) => [p.name, p]));
    const currentNames = Array.from(this.processes.keys());

    // Stop processes not in manifest
    for (const name of currentNames) {
      if (!desired.has(name)) {
        await this.stop(name);
        this.processes.delete(name);
      }
    }

    // Start/restart processes
    for (const [name, decl] of desired) {
      const existing = this.processes.get(name);
      if (!existing) {
        await this.start(decl);
      } else if (existing.decl.entry !== decl.entry) {
        await this.stop(name);
        this.processes.delete(name);
        await this.start(decl);
      }
    }
  }
}

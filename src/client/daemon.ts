import * as fs from "node:fs";
import * as path from "node:path";
import { execa } from "execa";
import type { Message, Issue } from "../shared/types.js";
import { encode } from "../protocol/codec.js";
import { createStateSync, createDataMessage } from "../protocol/messages.js";
import { SSEClient } from "./sse-client.js";
import { LocalServer } from "./local-server.js";
import { ProcessManager, type ManagedProcess } from "./process-manager.js";
import { GitOps } from "./git.js";
import { Scheduler } from "../daemon/scheduler.js";
import { CloudflareStorage } from "../storage/cloudflare-client.js";

export type DaemonRole = "client" | "server";

export type DaemonConfig = {
  role?: DaemonRole;
  serverUrl: string;
  token: string;
  workDir: string;
  localPort?: number;
};

export class Daemon {
  private config: DaemonConfig;
  private sseClient: SSEClient;
  private localServer: LocalServer;
  private processManager: ProcessManager;
  private gitOps: GitOps;
  private connected = false;
  private currentVersion = "v000";
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private inboxDir: string;
  private logStream: fs.WriteStream | null = null;
  private scheduler: Scheduler | null = null;
  private storage: CloudflareStorage;
  private startTime = Date.now();
  private issueQueue: Issue[] = [];
  private fixing = false;

  constructor(config: DaemonConfig) {
    this.config = config;
    this.inboxDir = path.join(config.workDir, "inbox");

    // Ensure directories
    fs.mkdirSync(this.inboxDir, { recursive: true });
    fs.mkdirSync(path.join(config.workDir, "manifests"), { recursive: true });
    fs.mkdirSync(path.join(config.workDir, "logs"), { recursive: true });

    const repoDir = path.join(config.workDir, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    this.gitOps = new GitOps(repoDir);
    this.processManager = new ProcessManager(repoDir);
    this.storage = new CloudflareStorage(config.serverUrl, config.token);

    this.localServer = new LocalServer({
      port: config.localPort ?? 0,
      onData: (channel, payload) => {
        this.handleLocalData(channel, payload);
      },
    });

    const role = config.role ?? "client";
    this.sseClient = new SSEClient({
      url: `${config.serverUrl}/sse?role=${role}`,
      token: config.token,
      onMessage: (msg) => this.handleMessage(msg),
      onConnect: () => {
        this.connected = true;
        this.log("info", "SSE connected", { url: config.serverUrl });
      },
      onDisconnect: () => {
        this.connected = false;
        this.log("warn", "SSE disconnected");
      },
    });
  }

  private setupLogging(): void {
    const logDir = path.join(this.config.workDir, "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, "daemon.log");
    this.logStream = fs.createWriteStream(logPath, { flags: "a" });
  }

  private log(
    level: "info" | "warn" | "error",
    msg: string,
    data?: unknown,
  ): void {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...(data !== undefined ? { data } : {}),
    });
    if (this.logStream) {
      this.logStream.write(entry + "\n");
    }
  }

  async start(): Promise<void> {
    this.setupLogging();
    this.log("info", "daemon starting", {
      serverUrl: this.config.serverUrl,
      workDir: this.config.workDir,
    });
    await this.gitOps.init();
    await this.localServer.start();
    this.sseClient.connect();

    // Periodic state-sync every 60s
    this.syncInterval = setInterval(() => {
      this.sendStateSync();
    }, 60000);

    // Server role: start scheduler
    if (this.config.role === "server") {
      this.scheduler = new Scheduler();
      this.scheduler.register({
        name: "log-upload",
        interval: 5 * 60 * 1000,
        handler: () => this.uploadLogsAndDashboard(),
        enabled: true,
      });
      this.scheduler.start();
      this.log("info", "scheduler started", {
        tasks: this.scheduler.list().map((t) => t.name),
      });
    }

    this.log("info", "daemon started");
  }

  async stop(): Promise<void> {
    this.log("info", "daemon stopping");
    if (this.scheduler) {
      this.scheduler.stop();
      this.scheduler = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    await this.processManager.stopAll();
    this.sseClient.disconnect();
    await this.localServer.stop();
    this.log("info", "daemon stopped");
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  async sendToServer(message: Message): Promise<void> {
    const res = await fetch(`${this.config.serverUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.token}`,
      },
      body: encode(message),
    });
    if (!res.ok) {
      this.log("error", "send failed", { status: res.status, type: message.type });
      throw new Error(`Server returned ${res.status}`);
    }
    this.log("info", "message sent to server", {
      type: message.type,
      id: message.id,
    });
  }

  getState(): {
    connected: boolean;
    version: string;
    processes: ManagedProcess[];
    agentConfigured: boolean;
    agentModel?: string;
  } {
    let agentConfigured = false;
    let agentModel: string | undefined;
    const piSettingsPath = path.join(
      this.config.workDir,
      "pi-client",
      ".pi",
      "agent",
      "settings.json",
    );
    if (fs.existsSync(piSettingsPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(piSettingsPath, "utf-8"));
        agentConfigured = true;
        agentModel = raw.model;
      } catch {
        // Invalid settings
      }
    }
    return {
      connected: this.connected,
      version: this.currentVersion,
      processes: this.processManager.list(),
      agentConfigured,
      agentModel,
    };
  }

  private handleMessage(msg: Message): void {
    this.log("info", "message received", {
      type: msg.type,
      id: msg.id,
      from: msg.from,
    });

    switch (msg.type) {
      case "capability-request":
        this.saveToInbox(msg);
        this.log("info", "capability-request saved to inbox", { id: msg.id });
        break;
      case "data":
        if ("channel" in msg) {
          this.log("info", "data received", { channel: msg.channel });
          if (msg.channel === "issues/new" && msg.payload) {
            this.handleIssue(msg.payload as Issue).catch((e) =>
              this.log("error", "handleIssue failed", { error: (e as Error).message }),
            );
          }
        }
        break;
      case "state-sync":
        this.currentVersion = msg.version;
        this.log("info", "state-sync received", {
          version: msg.version,
          health: msg.health,
        });
        break;
      case "capability-ready":
      case "negotiate":
        break;
    }
  }

  private handleLocalData(channel: string, _payload: unknown): void {
    this.log("info", "data forwarded to route", { channel });
  }

  private saveToInbox(msg: Message): void {
    const filePath = path.join(this.inboxDir, `${msg.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(msg, null, 2));
  }

  private async sendStateSync(): Promise<void> {
    if (!this.connected) return;
    try {
      const commit = await this.gitOps.getCurrentCommit();
      const processes = this.processManager.list().map((p) => ({
        name: p.name,
        entry: p.entry,
        type: "persistent" as const,
        port: p.port,
      }));

      const msg = createStateSync(
        this.config.role ?? "client",
        this.currentVersion,
        processes,
        "ok",
      );
      await this.sendToServer(msg);
      this.log("info", "state-sync sent", { version: this.currentVersion });
    } catch {
      this.log("error", "state-sync failed");
    }
  }

  private async handleIssue(issue: Issue): Promise<void> {
    this.log("info", "issue received from server", {
      id: issue.id,
      type: issue.type,
      severity: issue.severity,
      title: issue.title,
    });

    // Save to issues dir
    const issuesDir = path.join(this.config.workDir, "issues");
    fs.mkdirSync(issuesDir, { recursive: true });
    fs.writeFileSync(
      path.join(issuesDir, `${issue.id}.json`),
      JSON.stringify(issue, null, 2),
    );

    // Also save to inbox
    this.saveToInbox(issue as unknown as Message);

    if (issue.severity === "critical" || issue.severity === "high") {
      await this.attemptFixSafe(issue);
    } else if (issue.severity === "medium") {
      this.issueQueue.push(issue);
      if (this.issueQueue.length >= 3) {
        const batch = this.issueQueue.splice(0);
        for (const qi of batch) {
          await this.attemptFixSafe(qi);
        }
      }
    }
    // low → record only
  }

  private async attemptFixSafe(issue: Issue): Promise<void> {
    if (this.fixing) {
      this.log("warn", "already fixing another issue, queuing", { id: issue.id });
      this.issueQueue.push(issue);
      return;
    }
    this.fixing = true;
    try {
      await this.attemptFix(issue);
    } finally {
      this.fixing = false;
    }
  }

  private async attemptFix(issue: Issue, attempt: number = 1): Promise<void> {
    const MAX_ATTEMPTS = 3;
    const repoDir = this.getRepoDir();

    if (!repoDir) {
      this.log("error", "repo dir not found, cannot auto-fix");
      return;
    }

    this.log("info", "attempting fix", { issue_id: issue.id, attempt });

    const fixId = `fix-${Date.now()}`;
    const fixDir = path.join(this.config.workDir, "fixes");
    fs.mkdirSync(fixDir, { recursive: true });

    const prompt = this.buildFixPrompt(issue, attempt, repoDir);

    try {
      await execa("pi", ["-p", prompt], {
        cwd: repoDir,
        timeout: 300000,
      });

      // Run tests
      const testResult = await execa("npm", ["test"], {
        cwd: repoDir,
        timeout: 120000,
        reject: false,
      });

      const passedMatch = testResult.stdout.match(/(\d+) passed/);
      const failedMatch = testResult.stdout.match(/(\d+) failed/);
      const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
      const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;

      if (failed === 0 && testResult.exitCode === 0) {
        // Commit
        const git = new GitOps(repoDir);
        const commitHash = await git.commit(
          `fix(auto): ${issue.title}\n\nIssue: ${issue.id}\nDiscovered by: ${issue.discovered_by}`,
        );

        this.log("info", "fix passed", { issue_id: issue.id, commit: commitHash });

        const fix = {
          id: fixId,
          issue_ref: issue.id,
          status: "passed",
          diff_summary: `Auto-fixed: ${issue.title}`,
          files_changed: [],
          test_result: { passed, failed, new_tests_added: 0 },
          commit_hash: commitHash,
          attempts: attempt,
        };

        fs.writeFileSync(
          path.join(fixDir, `${fixId}.json`),
          JSON.stringify(fix, null, 2),
        );

        await this.sendToServer(
          createDataMessage(this.config.role ?? "client", "fixes/completed", fix),
        );
      } else {
        this.log("warn", "fix failed tests", { issue_id: issue.id, failed });
        await execa("git", ["checkout", "."], { cwd: repoDir }).catch(() => {});

        if (attempt < MAX_ATTEMPTS) {
          return this.attemptFix(issue, attempt + 1);
        }

        const fix = {
          id: fixId,
          issue_ref: issue.id,
          status: "abandoned",
          diff_summary: `Failed after ${MAX_ATTEMPTS} attempts`,
          files_changed: [],
          test_result: { passed, failed, new_tests_added: 0 },
          attempts: attempt,
        };
        fs.writeFileSync(
          path.join(fixDir, `${fixId}.json`),
          JSON.stringify(fix, null, 2),
        );
      }
    } catch (err) {
      this.log("error", "fix error", {
        issue_id: issue.id,
        error: (err as Error).message,
      });
      await execa("git", ["checkout", "."], { cwd: repoDir }).catch(() => {});

      if (attempt < MAX_ATTEMPTS) {
        return this.attemptFix(issue, attempt + 1);
      }
    }
  }

  private buildFixPrompt(issue: Issue, attempt: number, repoDir: string): string {
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

  private getRepoDir(): string | null {
    const localRepo = path.join(this.config.workDir, "repo");
    if (
      fs.existsSync(localRepo) &&
      fs.existsSync(path.join(localRepo, "package.json"))
    ) {
      return localRepo;
    }
    // Check if cwd is the sparkco-agent project
    if (fs.existsSync(path.join(process.cwd(), "src", "protocol", "codec.ts"))) {
      return process.cwd();
    }
    return null;
  }

  private async uploadLogsAndDashboard(): Promise<void> {
    // Upload log tail
    const logPath = path.join(this.config.workDir, "logs", "daemon.log");
    try {
      if (fs.existsSync(logPath)) {
        const result = await execa("tail", ["-200", logPath]);
        await this.storage.kvSet("server-logs", result.stdout, 3600);
      }
    } catch {
      // Ignore log upload failures
    }

    // Upload dashboard/task state
    try {
      const tasks = this.scheduler
        ? this.scheduler.list().map((t) => ({
            name: t.name,
            enabled: t.enabled,
            interval: t.interval,
            lastRun: t.lastRun,
            nextRun: t.nextRun,
          }))
        : [];
      await this.storage.kvSet(
        "server-tasks",
        tasks,
        600,
      );
      await this.storage.kvSet(
        "server-state",
        {
          connected: this.connected,
          uptime: Date.now() - this.startTime,
          role: this.config.role ?? "client",
          pid: process.pid,
        },
        600,
      );
    } catch {
      // Ignore
    }
  }
}

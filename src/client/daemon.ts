import * as fs from "node:fs";
import * as path from "node:path";
import type { Message } from "../shared/types.js";
import { encode } from "../protocol/codec.js";
import { createStateSync } from "../protocol/messages.js";
import { SSEClient } from "./sse-client.js";
import { LocalServer } from "./local-server.js";
import { ProcessManager, type ManagedProcess } from "./process-manager.js";
import { GitOps } from "./git.js";

export type DaemonConfig = {
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

    this.localServer = new LocalServer({
      port: config.localPort ?? 0,
      onData: (channel, payload) => {
        this.handleLocalData(channel, payload);
      },
    });

    this.sseClient = new SSEClient({
      url: `${config.serverUrl}/sse`,
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

    this.log("info", "daemon started");
  }

  async stop(): Promise<void> {
    this.log("info", "daemon stopping");
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
        "client",
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
}

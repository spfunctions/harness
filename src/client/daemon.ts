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
      },
      onDisconnect: () => {
        this.connected = false;
      },
    });
  }

  async start(): Promise<void> {
    await this.gitOps.init();
    await this.localServer.start();
    this.sseClient.connect();

    // Periodic state-sync every 60s
    this.syncInterval = setInterval(() => {
      this.sendStateSync();
    }, 60000);
  }

  async stop(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    await this.processManager.stopAll();
    this.sseClient.disconnect();
    await this.localServer.stop();
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
      throw new Error(`Server returned ${res.status}`);
    }
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
    switch (msg.type) {
      case "capability-request":
        this.saveToInbox(msg);
        break;
      case "data":
        // Forward to local server routes if applicable
        break;
      case "state-sync":
        this.currentVersion = msg.version;
        break;
      case "capability-ready":
      case "negotiate":
        // Log for pi to pick up
        break;
    }
  }

  private handleLocalData(_channel: string, _payload: unknown): void {
    // Received data from local route — can forward to server if needed
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

      const health = processes.some((p) => p.name)
        ? "ok"
        : "ok";

      const msg = createStateSync(
        "client",
        this.currentVersion,
        processes,
        health,
      );
      await this.sendToServer(msg);
    } catch {
      // Silently fail — will retry next interval
    }
  }
}

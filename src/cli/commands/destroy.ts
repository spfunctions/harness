import * as fs from "node:fs";
import {
  loadConfig,
  getDaemonPid,
  getSparkcoDir,
} from "../config.js";
import * as output from "../output.js";
import { askText } from "../wizard/prompts.js";
import {
  destroyServerResources,
} from "../wizard/cloudflare.js";
import { uninstallSkill } from "../../pi/install.js";

export async function destroyCommand(options: {
  force?: boolean;
}): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch {
    output.error("Not initialized. Nothing to destroy.");
    return;
  }

  const workerName = config.server.workerName;

  if (!options.force) {
    process.stdout.write(`\n⚠ This will:\n`);
    process.stdout.write(
      `  - Delete Cloudflare Worker '${workerName}'\n`,
    );
    process.stdout.write(`  - Delete KV namespace\n`);
    process.stdout.write(`  - Delete Durable Object\n`);
    process.stdout.write(`  - Remove ${getSparkcoDir()} directory\n`);
    process.stdout.write(`  - Stop daemon\n\n`);

    const confirm = await askText(
      `Type '${workerName}' to confirm:`,
    );
    if (confirm !== workerName) {
      output.error("Confirmation failed. Aborted.");
      return;
    }
  }

  // 1. Stop daemon
  const pid = getDaemonPid();
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
      await new Promise((r) => setTimeout(r, 2000));
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already dead
      }
    } catch {
      // Not running
    }
    output.success("Daemon stopped.");
  }

  // 2. Delete CF resources
  const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? "";
  if (apiToken) {
    try {
      await destroyServerResources(
        {
          apiToken,
          accountId: config.server.accountId,
          accountName: "",
        },
        workerName,
        config.server.kvNamespaceId,
      );
      output.success("Cloudflare resources deleted.");
    } catch (err) {
      output.warn(
        `Failed to delete CF resources: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    output.warn(
      "CLOUDFLARE_API_TOKEN not set — skipping CF resource cleanup.",
    );
  }

  // 3. Uninstall skill
  try {
    await uninstallSkill();
    output.success("Skill uninstalled.");
  } catch {
    // OK if not installed
  }

  // 4. Remove local directory
  if (fs.existsSync(getSparkcoDir())) {
    fs.rmSync(getSparkcoDir(), { recursive: true, force: true });
    output.success(`Removed ${getSparkcoDir()}.`);
  }

  output.success("Destroy complete.");
}

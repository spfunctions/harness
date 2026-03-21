import * as fs from "node:fs";
import * as path from "node:path";
import { nanoid } from "nanoid";
import chalk from "chalk";
import { checkEnvironment } from "./wizard/validate.js";
import {
  verifyToken,
  listAccounts,
  deployServerResources,
  verifyDeployment,
} from "./wizard/cloudflare.js";
import { askText, askPassword, askConfirm, askSelect } from "./wizard/prompts.js";
import { detectAgents, installSkill } from "../pi/install.js";
import {
  getSparkcoDir,
  saveConfig,
  type SparkcoConfig,
} from "./config.js";
import * as output from "./output.js";

export type InitConfig = {
  cloudflareApiToken: string;
  cloudflareAccountId: string;
  workerName: string;
  workDir: string;
  skipPi: boolean;
};

const DIRS = [
  "",
  "credentials",
  "logs",
  "inbox",
  "manifests",
  "repo",
];

function ensureDirectories(workDir: string): void {
  for (const dir of DIRS) {
    fs.mkdirSync(path.join(workDir, dir), { recursive: true });
  }
}

export async function initInteractive(): Promise<void> {
  process.stdout.write(
    chalk.bold("\n  SparkCo Harness Setup Wizard\n\n"),
  );

  // Step 1: Environment check
  process.stdout.write(chalk.bold("Step 1: Environment Check\n"));
  const checks = await checkEnvironment();
  let hasBlocker = false;
  for (const check of checks) {
    if (check.status === "ok") {
      output.success(`${check.name} ${check.version ?? ""}`);
    } else if (check.status === "missing" && check.required) {
      output.error(
        `${check.name} — missing (required). ${check.installHint ?? ""}`,
      );
      hasBlocker = true;
    } else if (check.status === "outdated" && check.required) {
      output.error(
        `${check.name} — ${check.version} (outdated). ${check.installHint ?? ""}`,
      );
      hasBlocker = true;
    } else {
      output.warn(
        `${check.name} — missing (optional). ${check.installHint ?? ""}`,
      );
    }
  }

  if (hasBlocker) {
    output.error("Fix required dependencies above, then re-run 'sparkco init'.");
    process.exit(1);
  }
  process.stdout.write("\n");

  // Step 2: Cloudflare configuration
  process.stdout.write(chalk.bold("Step 2: Cloudflare Configuration\n"));
  process.stdout.write(
    `  Create an API token at: ${chalk.cyan("https://dash.cloudflare.com/profile/api-tokens")}\n`,
  );
  process.stdout.write(
    "  Required permissions: Workers Scripts (Edit), KV Storage (Edit), \n" +
    "  Workers Routes (Edit), Durable Objects (Edit), Account Settings (Read)\n\n",
  );

  const apiToken = await askPassword("Cloudflare API Token:");

  const spin1 = output.spinner("Verifying token...");
  const tokenValid = await verifyToken(apiToken);
  if (!tokenValid) {
    spin1.stop();
    output.error("Invalid or inactive API token.");
    process.exit(1);
  }
  spin1.stop("Token verified");

  const accounts = await listAccounts(apiToken);
  let accountId: string;
  let accountName: string;
  if (accounts.length === 0) {
    output.error("No Cloudflare accounts found for this token.");
    process.exit(1);
  } else if (accounts.length === 1) {
    accountId = accounts[0].id;
    accountName = accounts[0].name;
    output.success(`Account: ${accountName}`);
  } else {
    const selected = await askSelect(
      "Select Cloudflare account:",
      accounts.map((a) => ({ name: `${a.name} (${a.id})`, value: a.id })),
    );
    accountId = selected;
    accountName = accounts.find((a) => a.id === selected)!.name;
  }

  const workerName = await askText("Worker name:", "sparkco-harness");
  process.stdout.write("\n");

  // Step 3: Deploy Server
  process.stdout.write(chalk.bold("Step 3: Deploy Server\n"));
  const spin2 = output.spinner("Deploying Worker + Durable Object...");
  try {
    const { workerUrl, kvNamespaceId } = await deployServerResources(
      { apiToken, accountId, accountName },
      workerName,
      getSparkcoDir(),
    );
    spin2.stop(`Deployed to ${workerUrl}`);

    const sessionToken = nanoid(32);

    // Step 4: Initialize Client
    process.stdout.write(chalk.bold("\nStep 4: Initialize Client\n"));
    ensureDirectories(getSparkcoDir());
    output.success(`Created ${getSparkcoDir()}`);

    const config: SparkcoConfig = {
      version: "1",
      server: {
        workerName,
        workerUrl,
        accountId,
        kvNamespaceId,
      },
      client: { port: 3847, routes: [] },
      session: { token: sessionToken, createdAt: Date.now() },
      pi: { skillInstalled: false, target: "both" },
      daemon: {
        autoStart: true,
        stateSyncInterval: 60000,
        logRetentionDays: 7,
      },
    };
    saveConfig(config);
    output.success("Config saved");

    // Verify deployment
    const spin3 = output.spinner("Verifying deployment...");
    const deployed = await verifyDeployment(workerUrl, sessionToken);
    if (deployed) {
      spin3.stop("Server health check passed");
    } else {
      spin3.stop();
      output.warn(
        "Server health check failed — this is normal before secrets are configured",
      );
    }

    // Step 5: Pi integration
    process.stdout.write(chalk.bold("\nStep 5: Pi Integration\n"));
    const agents = await detectAgents();
    if (agents.pi || agents.claudeCode) {
      const shouldInstall = await askConfirm(
        "Install sparkco skill for your AI agent(s)?",
      );
      if (shouldInstall) {
        const target =
          agents.pi && agents.claudeCode
            ? "both"
            : agents.pi
              ? "pi"
              : "claude-code";
        await installSkill(target);
        config.pi.skillInstalled = true;
        config.pi.target = target;
        saveConfig(config);
        output.success(`Skill installed (${target})`);
      }
    } else {
      output.warn("No AI agent detected (pi or Claude Code). Skipping skill install.");
    }

    // Step 6: Summary
    process.stdout.write(chalk.bold("\n  Setup Complete!\n\n"));
    output.table(
      ["Component", "Status"],
      [
        ["Server", `${workerUrl}`],
        ["Account", accountName],
        ["Worker", workerName],
        ["Config", CONFIG_PATH],
        ["Token", `${sessionToken.slice(0, 8)}...`],
      ],
    );
    process.stdout.write(
      `\n  Next: run ${chalk.cyan("sparkco daemon start")} to start the client daemon.\n\n`,
    );
  } catch (err) {
    spin2.stop();
    output.error(
      `Deployment failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

export async function initNonInteractive(): Promise<void> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const workerName =
    process.env.SPARKCO_WORKER_NAME ?? "sparkco-harness";

  if (!apiToken || !accountId) {
    output.error(
      "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID environment variables required",
    );
    process.exit(1);
  }

  const tokenValid = await verifyToken(apiToken);
  if (!tokenValid) {
    output.error("Invalid CLOUDFLARE_API_TOKEN");
    process.exit(1);
  }

  ensureDirectories(getSparkcoDir());

  try {
    const { workerUrl, kvNamespaceId } = await deployServerResources(
      { apiToken, accountId, accountName: "" },
      workerName,
      getSparkcoDir(),
    );

    const sessionToken = nanoid(32);
    const config: SparkcoConfig = {
      version: "1",
      server: { workerName, workerUrl, accountId, kvNamespaceId },
      client: { port: 3847, routes: [] },
      session: { token: sessionToken, createdAt: Date.now() },
      pi: { skillInstalled: false, target: "both" },
      daemon: {
        autoStart: true,
        stateSyncInterval: 60000,
        logRetentionDays: 7,
      },
    };
    saveConfig(config);
    output.success(`Initialized at ${getSparkcoDir()}, deployed to ${workerUrl}`);
  } catch (err) {
    output.error(
      `Init failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

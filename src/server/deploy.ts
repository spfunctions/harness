import { execa } from "execa";
import * as fs from "node:fs";
import * as path from "node:path";
import { HarnessError } from "../shared/errors.js";

export type DeployConfig = {
  workerName: string;
  accountId: string;
  apiToken: string;
  configDir: string;
};

export type DeployResult = {
  success: boolean;
  url?: string;
  error?: string;
  deployedAt?: number;
};

export async function deployWorker(
  config: DeployConfig,
): Promise<DeployResult> {
  const wranglerPath = path.join(config.configDir, "wrangler.toml");

  if (!fs.existsSync(wranglerPath)) {
    return {
      success: false,
      error: `wrangler.toml not found at ${wranglerPath}. Run 'sparkco init' first.`,
    };
  }

  // Ensure server files are present (re-copy on redeploy)
  try {
    const { copyServerFiles } = await import("../cli/wizard/cloudflare.js");
    copyServerFiles(config.configDir);
  } catch {
    // May fail if cloudflare module not loadable — files should already exist from init
  }

  try {
    const result = await execa(
      "wrangler",
      ["deploy", "--config", wranglerPath],
      {
        env: { CLOUDFLARE_API_TOKEN: config.apiToken },
        cwd: config.configDir,
      },
    );

    const urlMatch = result.stdout.match(
      /https:\/\/[^\s]+\.workers\.dev/,
    );
    const url =
      urlMatch?.[0] ?? `https://${config.workerName}.workers.dev`;

    // Record deploy time
    const deployInfoPath = path.join(config.configDir, "deploy.json");
    fs.writeFileSync(
      deployInfoPath,
      JSON.stringify(
        { url, deployedAt: Date.now(), workerName: config.workerName },
        null,
        2,
      ),
    );

    return { success: true, url, deployedAt: Date.now() };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export async function getDeployStatus(
  config: DeployConfig,
): Promise<{
  deployed: boolean;
  url?: string;
  lastDeployed?: number;
}> {
  const deployInfoPath = path.join(config.configDir, "deploy.json");
  if (!fs.existsSync(deployInfoPath)) {
    return { deployed: false };
  }
  try {
    const info = JSON.parse(fs.readFileSync(deployInfoPath, "utf-8"));
    return {
      deployed: true,
      url: info.url,
      lastDeployed: info.deployedAt,
    };
  } catch {
    return { deployed: false };
  }
}

export async function deleteWorker(
  config: DeployConfig,
): Promise<void> {
  try {
    await execa("wrangler", ["delete", "--name", config.workerName], {
      env: { CLOUDFLARE_API_TOKEN: config.apiToken },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    throw new HarnessError(
      "DEPLOY_FAILED",
      `Failed to delete worker: ${message}`,
    );
  }

  // Clean up deploy info
  const deployInfoPath = path.join(config.configDir, "deploy.json");
  if (fs.existsSync(deployInfoPath)) {
    fs.unlinkSync(deployInfoPath);
  }
}

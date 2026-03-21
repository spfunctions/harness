import { loadConfig, getSparkcoDir } from "../config.js";
import * as output from "../output.js";
import {
  deployWorker,
  getDeployStatus,
} from "../../server/deploy.js";

export async function deployCommand(options: {
  status?: boolean;
}): Promise<void> {
  const config = loadConfig();
  const deployConfig = {
    workerName: config.server.workerName,
    accountId: config.server.accountId,
    apiToken: "",
    configDir: getSparkcoDir(),
  };

  deployConfig.apiToken = process.env.CLOUDFLARE_API_TOKEN ?? "";

  if (options.status) {
    const status = await getDeployStatus(deployConfig);
    output.print(status, (data) => {
      const s = data as {
        deployed: boolean;
        url?: string;
        lastDeployed?: number;
      };
      if (!s.deployed) return "Not deployed.";
      return [
        `Deployed: ${s.url}`,
        `Last deployed: ${s.lastDeployed ? new Date(s.lastDeployed).toISOString() : "unknown"}`,
      ].join("\n");
    });
    return;
  }

  if (!deployConfig.apiToken) {
    output.error(
      "Set CLOUDFLARE_API_TOKEN environment variable or run 'sparkco init'.",
    );
    return;
  }

  const spin = output.spinner("Deploying...");
  const result = await deployWorker(deployConfig);
  spin.stop();

  if (result.success) {
    output.success(`Deployed to ${result.url}`);
  } else {
    output.error(`Deploy failed: ${result.error}`);
  }
}

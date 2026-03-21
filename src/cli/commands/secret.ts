import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig, getSparkcoDir } from "../config.js";
import * as output from "../output.js";
import {
  setSecret as cfSetSecret,
  deleteSecret as cfDeleteSecret,
  listSecrets as cfListSecrets,
  maskSecret,
} from "../../server/secrets.js";

function credsDir(): string {
  return path.join(getSparkcoDir(), "credentials");
}

function getSecretConfig() {
  const config = loadConfig();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? "";
  if (!apiToken) {
    throw new Error("Set CLOUDFLARE_API_TOKEN environment variable.");
  }
  return {
    workerName: config.server.workerName,
    accountId: config.server.accountId,
    apiToken,
  };
}

export async function secretCommand(
  action: string,
  name?: string,
  value?: string,
): Promise<void> {
  switch (action) {
    case "set": {
      if (!name || !value) {
        output.error("Usage: sparkco secret set <name> <value>");
        return;
      }
      try {
        const cfg = getSecretConfig();
        await cfSetSecret(cfg, name, value);
        const dir = credsDir();
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, `${name}.json`),
          JSON.stringify({
            name,
            masked: maskSecret(value),
            setAt: Date.now(),
          }),
        );
        output.success(`Secret ${name} set.`);
      } catch (err) {
        output.error(
          err instanceof Error ? err.message : String(err),
        );
      }
      break;
    }

    case "get": {
      if (!name) {
        output.error("Usage: sparkco secret get <name>");
        return;
      }
      const localPath = path.join(credsDir(), `${name}.json`);
      if (!fs.existsSync(localPath)) {
        output.error(`Secret ${name} not found locally.`);
        return;
      }
      const info = JSON.parse(fs.readFileSync(localPath, "utf-8"));
      output.print(info, (data) => {
        const d = data as { name: string; masked: string };
        return `${d.name}: ${d.masked}`;
      });
      break;
    }

    case "list": {
      try {
        const cfg = getSecretConfig();
        const secrets = await cfListSecrets(cfg);
        if (secrets.length === 0) {
          output.print({ secrets: [] }, () => "No secrets configured.");
        } else {
          output.table(
            ["name"],
            secrets.map((s) => [s]),
          );
        }
      } catch {
        const dir = credsDir();
        if (!fs.existsSync(dir)) {
          output.print({ secrets: [] }, () => "No secrets configured.");
          return;
        }
        const files = fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".json"));
        output.table(
          ["name"],
          files.map((f) => [f.replace(".json", "")]),
        );
      }
      break;
    }

    case "delete": {
      if (!name) {
        output.error("Usage: sparkco secret delete <name>");
        return;
      }
      try {
        const cfg = getSecretConfig();
        await cfDeleteSecret(cfg, name);
        const localPath = path.join(credsDir(), `${name}.json`);
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        output.success(`Secret ${name} deleted.`);
      } catch (err) {
        output.error(
          err instanceof Error ? err.message : String(err),
        );
      }
      break;
    }

    default:
      output.error(
        `Unknown action: ${action}. Use: set, get, list, delete`,
      );
  }
}

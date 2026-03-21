import * as fs from "node:fs";
import * as path from "node:path";
import { nanoid } from "nanoid";

const SPARKCO_DIR = path.join(process.env.HOME || "~", ".sparkco");

const DIRS = [
  "",
  "credentials",
  "logs",
  "inbox",
  "manifests",
  "repo",
];

function ensureDirectories(): void {
  for (const dir of DIRS) {
    fs.mkdirSync(path.join(SPARKCO_DIR, dir), { recursive: true });
  }
}

function generateToken(): string {
  return nanoid(32);
}

function writeConfig(serverUrl: string, token: string): void {
  const configPath = path.join(SPARKCO_DIR, "config.json");
  const config = {
    serverUrl,
    token,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export async function init(serverUrl?: string): Promise<void> {
  process.stdout.write("Initializing sparkco harness...\n");

  // 1. Create directory structure
  ensureDirectories();
  process.stdout.write(`  Created directory structure at ${SPARKCO_DIR}\n`);

  // 2. Generate session token
  const token = generateToken();
  process.stdout.write(`  Generated session token: ${token.slice(0, 8)}...\n`);

  // 3. Write config
  const url = serverUrl ?? "https://sparkco-harness.workers.dev";
  writeConfig(url, token);
  process.stdout.write(`  Config written to ${SPARKCO_DIR}/config.json\n`);

  // 4. Output deploy instructions
  process.stdout.write("\n");
  process.stdout.write("To deploy the server (Phase 1 will automate this):\n");
  process.stdout.write("  npx wrangler deploy\n");
  process.stdout.write("\n");

  // 5. Status summary
  process.stdout.write("Status:\n");
  process.stdout.write(`  Work directory: ${SPARKCO_DIR}\n`);
  process.stdout.write(`  Server URL: ${url}\n`);
  process.stdout.write(`  Token: ${token.slice(0, 8)}...\n`);
  process.stdout.write("\n");
  process.stdout.write("Initialization complete.\n");
}

// CLI entry point
if (
  process.argv[1] &&
  (process.argv[1].endsWith("init.js") ||
    process.argv[1].endsWith("init.ts"))
) {
  const serverUrl = process.argv[2];
  init(serverUrl).catch((err) => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  });
}

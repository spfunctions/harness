import { execa } from "execa";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { HarnessError } from "../../shared/errors.js";

/**
 * Find the package root (where src/server/ lives).
 * Works in dev (cwd) and when installed as a package.
 */
function getPackageRoot(): string {
  // Try relative to this file: wizard/ -> cli/ -> src/ -> root
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const candidate = path.resolve(thisDir, "..", "..", "..");
  if (fs.existsSync(path.join(candidate, "src", "server", "worker.ts"))) {
    return candidate;
  }
  // Fallback to cwd
  if (fs.existsSync(path.join(process.cwd(), "src", "server", "worker.ts"))) {
    return process.cwd();
  }
  return candidate;
}

const SERVER_FILES = [
  "src/server/worker.ts",
  "src/server/durable-object.ts",
  "src/server/sse-server.ts",
  "src/shared/types.ts",
  "src/shared/errors.ts",
  "src/shared/models.ts",
  "src/protocol/messages.ts",
  "src/protocol/codec.ts",
];

export function copyServerFiles(configDir: string): void {
  const pkgRoot = getPackageRoot();
  const serverDir = path.join(configDir, "server");
  fs.mkdirSync(serverDir, { recursive: true });

  for (const file of SERVER_FILES) {
    const src = path.join(pkgRoot, file);
    const dest = path.join(serverDir, path.basename(file));
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }
}

export type CloudflareCredentials = {
  apiToken: string;
  accountId: string;
  accountName: string;
};

const CF_API = "https://api.cloudflare.com/client/v4";

async function cfFetch(
  token: string,
  endpoint: string,
  options?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${CF_API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new HarnessError(
      "DEPLOY_FAILED",
      `Cloudflare API error ${res.status}: ${text}`,
    );
  }
  return res.json();
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    const data = (await cfFetch(token, "/user/tokens/verify")) as {
      result: { status: string };
    };
    return data.result.status === "active";
  } catch {
    return false;
  }
}

export async function listAccounts(
  token: string,
): Promise<Array<{ id: string; name: string }>> {
  const data = (await cfFetch(token, "/accounts")) as {
    result: Array<{ id: string; name: string }>;
  };
  return data.result.map((a) => ({ id: a.id, name: a.name }));
}

export async function getOrCreateKVNamespace(
  token: string,
  accountId: string,
  namespaceName: string,
): Promise<string> {
  // 1. List existing namespaces
  const listData = (await cfFetch(
    token,
    `/accounts/${accountId}/storage/kv/namespaces`,
  )) as { result: Array<{ id: string; title: string }> };

  // 2. Check if one with this name already exists
  const existing = listData.result.find((ns) => ns.title === namespaceName);
  if (existing) {
    return existing.id;
  }

  // 3. Create new namespace
  const createData = (await cfFetch(
    token,
    `/accounts/${accountId}/storage/kv/namespaces`,
    {
      method: "POST",
      body: JSON.stringify({ title: namespaceName }),
    },
  )) as { result: { id: string } };
  return createData.result.id;
}

export async function deployServerResources(
  creds: CloudflareCredentials,
  workerName: string,
  configDir: string,
): Promise<{
  workerUrl: string;
  kvNamespaceId: string;
}> {
  // 1. Get or create KV namespace (idempotent)
  const kvNamespaceId = await getOrCreateKVNamespace(
    creds.apiToken,
    creds.accountId,
    `${workerName}-kv`,
  );

  // 2. Copy server source files to configDir/server/
  copyServerFiles(configDir);

  // 3. Generate wrangler.toml from template
  const pkgRoot = getPackageRoot();
  const templatePath = path.join(pkgRoot, "templates/wrangler-base.toml");
  let template: string;
  try {
    template = fs.readFileSync(templatePath, "utf-8");
  } catch {
    template = `name = "{{WORKER_NAME}}"
main = "server/worker.ts"
compatibility_date = "2024-09-25"
compatibility_flags = ["nodejs_compat"]
account_id = "{{ACCOUNT_ID}}"

[durable_objects]
bindings = [
  { name = "HARNESS_DO", class_name = "HarnessDO" }
]

[[kv_namespaces]]
binding = "HARNESS_KV"
id = "{{KV_NAMESPACE_ID}}"

[[migrations]]
tag = "v1"
new_classes = ["HarnessDO"]

[vars]
ENVIRONMENT = "production"`;
  }

  const wranglerContent = template
    .replace(/\{\{WORKER_NAME\}\}/g, workerName)
    .replace(/\{\{ACCOUNT_ID\}\}/g, creds.accountId)
    .replace(/\{\{KV_NAMESPACE_ID\}\}/g, kvNamespaceId);

  const wranglerPath = path.join(configDir, "wrangler.toml");
  fs.writeFileSync(wranglerPath, wranglerContent);

  // 4. Deploy with wrangler (cwd = configDir so relative paths resolve)
  try {
    const result = await execa(
      "wrangler",
      ["deploy", "--config", wranglerPath],
      {
        env: { CLOUDFLARE_API_TOKEN: creds.apiToken },
        cwd: configDir,
      },
    );
    // Parse URL from wrangler output
    const urlMatch = result.stdout.match(
      /https:\/\/[^\s]+\.workers\.dev/,
    );
    const workerUrl =
      urlMatch?.[0] ?? `https://${workerName}.workers.dev`;

    return { workerUrl, kvNamespaceId };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    throw new HarnessError(
      "DEPLOY_FAILED",
      `Wrangler deploy failed: ${message}`,
    );
  }
}

export async function verifyDeployment(
  workerUrl: string,
  token: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${workerUrl}/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { status: string };
    return body.status === "ok";
  } catch {
    return false;
  }
}

export async function destroyServerResources(
  creds: CloudflareCredentials,
  workerName: string,
  kvNamespaceId?: string,
): Promise<void> {
  // Delete worker
  try {
    await execa("wrangler", ["delete", "--name", workerName], {
      env: { CLOUDFLARE_API_TOKEN: creds.apiToken },
    });
  } catch {
    // May already be deleted
  }

  // Delete KV namespace
  if (kvNamespaceId) {
    try {
      await cfFetch(
        creds.apiToken,
        `/accounts/${creds.accountId}/storage/kv/namespaces/${kvNamespaceId}`,
        { method: "DELETE" },
      );
    } catch {
      // May already be deleted
    }
  }
}

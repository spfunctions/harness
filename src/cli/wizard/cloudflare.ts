import { execa } from "execa";
import * as fs from "node:fs";
import * as path from "node:path";
import { HarnessError } from "../../shared/errors.js";

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

export async function deployServerResources(
  creds: CloudflareCredentials,
  workerName: string,
  configDir: string,
): Promise<{
  workerUrl: string;
  kvNamespaceId: string;
}> {
  // 1. Create KV namespace
  const kvData = (await cfFetch(
    creds.apiToken,
    `/accounts/${creds.accountId}/storage/kv/namespaces`,
    {
      method: "POST",
      body: JSON.stringify({ title: `${workerName}-kv` }),
    },
  )) as { result: { id: string } };
  const kvNamespaceId = kvData.result.id;

  // 2. Generate wrangler.toml from template
  const templatePath = path.resolve("templates/wrangler-base.toml");
  let template: string;
  try {
    template = fs.readFileSync(templatePath, "utf-8");
  } catch {
    // Fallback if template not found (e.g. running from installed package)
    template = `name = "{{WORKER_NAME}}"
main = "src/server/worker.ts"
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

  // 3. Deploy with wrangler
  try {
    const result = await execa(
      "wrangler",
      ["deploy", "--config", wranglerPath],
      {
        env: { CLOUDFLARE_API_TOKEN: creds.apiToken },
        cwd: path.resolve("."),
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

import { HarnessError } from "../shared/errors.js";

export type SecretConfig = {
  workerName: string;
  accountId: string;
  apiToken: string;
};

const CF_API = "https://api.cloudflare.com/client/v4";

export async function setSecret(
  config: SecretConfig,
  name: string,
  value: string,
): Promise<void> {
  const res = await fetch(
    `${CF_API}/accounts/${config.accountId}/workers/scripts/${config.workerName}/secrets`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, text: value, type: "secret_text" }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new HarnessError(
      "DEPLOY_FAILED",
      `Failed to set secret ${name}: ${text}`,
    );
  }
}

export async function deleteSecret(
  config: SecretConfig,
  name: string,
): Promise<void> {
  const res = await fetch(
    `${CF_API}/accounts/${config.accountId}/workers/scripts/${config.workerName}/secrets/${name}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
      },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new HarnessError(
      "DEPLOY_FAILED",
      `Failed to delete secret ${name}: ${text}`,
    );
  }
}

export async function listSecrets(
  config: SecretConfig,
): Promise<string[]> {
  const res = await fetch(
    `${CF_API}/accounts/${config.accountId}/workers/scripts/${config.workerName}/secrets`,
    {
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
      },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new HarnessError(
      "DEPLOY_FAILED",
      `Failed to list secrets: ${text}`,
    );
  }
  const data = (await res.json()) as {
    result: Array<{ name: string }>;
  };
  return data.result.map((s) => s.name);
}

export function maskSecret(value: string): string {
  if (value.length <= 8) return "***";
  return value.slice(0, 4) + "***" + value.slice(-4);
}

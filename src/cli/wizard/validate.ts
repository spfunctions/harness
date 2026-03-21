import { execa } from "execa";

export type EnvironmentCheck = {
  name: string;
  status: "ok" | "missing" | "outdated";
  version?: string;
  required: boolean;
  installHint?: string;
};

async function checkCommand(
  cmd: string,
  args: string[],
): Promise<string | null> {
  try {
    const result = await execa(cmd, args);
    return result.stdout.trim();
  } catch {
    return null;
  }
}

export async function checkEnvironment(): Promise<EnvironmentCheck[]> {
  const checks: EnvironmentCheck[] = [];

  // git
  const gitVersion = await checkCommand("git", ["--version"]);
  checks.push({
    name: "git",
    status: gitVersion ? "ok" : "missing",
    version: gitVersion
      ? gitVersion.replace("git version ", "")
      : undefined,
    required: true,
    installHint: gitVersion
      ? undefined
      : "Install git: https://git-scm.com/downloads",
  });

  // node
  const nodeVersionRaw = process.version;
  const major = parseInt(nodeVersionRaw.slice(1).split(".")[0], 10);
  checks.push({
    name: "node",
    status: major >= 18 ? "ok" : "outdated",
    version: nodeVersionRaw,
    required: true,
    installHint:
      major < 18
        ? "Node.js >= 18 required. Update: https://nodejs.org/"
        : undefined,
  });

  // wrangler
  const wranglerVersion = await checkCommand("wrangler", ["--version"]);
  checks.push({
    name: "wrangler",
    status: wranglerVersion ? "ok" : "missing",
    version: wranglerVersion ?? undefined,
    required: true,
    installHint: wranglerVersion
      ? undefined
      : "npm install -g wrangler",
  });

  // pi (optional)
  const piVersion = await checkCommand("pi", ["--version"]);
  checks.push({
    name: "pi",
    status: piVersion ? "ok" : "missing",
    version: piVersion ?? undefined,
    required: false,
    installHint: piVersion
      ? undefined
      : "npm install -g @anthropic-ai/claude-code (optional)",
  });

  return checks;
}

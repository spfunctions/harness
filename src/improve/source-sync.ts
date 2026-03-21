import * as fs from "node:fs";
import * as path from "node:path";
import { Glob } from "glob";

const SOURCE_PATTERNS = [
  "src/shared/*.ts",
  "src/protocol/*.ts",
  "src/client/*.ts",
  "src/server/*.ts",
  "src/cli/commands/*.ts",
  "src/improve/*.ts",
  "tests/unit/**/*.test.ts",
  "tests/integration/**/*.test.ts",
];

export async function collectSources(
  repoDir: string,
): Promise<Map<string, string>> {
  const sources = new Map<string, string>();

  for (const pattern of SOURCE_PATTERNS) {
    const g = new Glob(pattern, { cwd: repoDir });
    for await (const file of g) {
      const fullPath = path.join(repoDir, file);
      if (fs.existsSync(fullPath)) {
        sources.set(file, fs.readFileSync(fullPath, "utf-8"));
      }
    }
  }

  return sources;
}

export async function uploadSources(
  sources: Map<string, string>,
  serverUrl: string,
  token: string,
): Promise<{ uploaded: number; errors: number }> {
  let uploaded = 0;
  let errors = 0;

  for (const [filePath, content] of sources) {
    try {
      const res = await fetch(
        `${serverUrl}/sources/${encodeURIComponent(filePath)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "text/plain",
          },
          body: content,
        },
      );
      if (res.ok) uploaded++;
      else errors++;
    } catch {
      errors++;
    }
  }

  return { uploaded, errors };
}

export async function uploadChangedFiles(
  repoDir: string,
  files: string[],
  serverUrl: string,
  token: string,
): Promise<void> {
  for (const file of files) {
    const fullPath = path.join(repoDir, file);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, "utf-8");
    await fetch(
      `${serverUrl}/sources/${encodeURIComponent(file)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/plain",
        },
        body: content,
      },
    ).catch(() => {});
  }
}

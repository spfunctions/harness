import { z } from "zod";
import type { Manifest, SideState } from "../shared/types.js";
import { HarnessError } from "../shared/errors.js";

const processDeclarationSchema = z.object({
  name: z.string(),
  entry: z.string(),
  type: z.enum(["persistent", "cron"]),
  schedule: z.string().optional(),
  port: z.number().optional(),
});

const sideStateSchema = z.object({
  commit: z.string(),
  processes: z.array(processDeclarationSchema),
});

const manifestSchema = z.object({
  version: z.string(),
  timestamp: z.number(),
  server: sideStateSchema,
  client: sideStateSchema,
  decision_trace: z.string().optional(),
  rollback_to: z.string().optional(),
});

function nextVersion(previousVersion?: string): string {
  if (!previousVersion) {
    return "v001";
  }
  const num = parseInt(previousVersion.slice(1), 10);
  return `v${String(num + 1).padStart(3, "0")}`;
}

export function createManifest(
  server: SideState,
  client: SideState,
  previousVersion?: string,
): Manifest {
  const manifest: Manifest = {
    version: nextVersion(previousVersion),
    timestamp: Date.now(),
    server,
    client,
  };
  if (previousVersion) {
    manifest.rollback_to = previousVersion;
  }
  return manifest;
}

export function serializeManifest(manifest: Manifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function deserializeManifest(raw: string): Manifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HarnessError(
      "INVALID_MESSAGE",
      `Invalid manifest JSON: ${raw}`,
    );
  }
  const result = manifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new HarnessError(
      "INVALID_MESSAGE",
      `Invalid manifest: ${result.error.message}`,
    );
  }
  return result.data as Manifest;
}

export function canRollback(manifest: Manifest): boolean {
  return manifest.rollback_to !== undefined && manifest.rollback_to !== "";
}

import * as fs from "node:fs";
import * as path from "node:path";
import { getSparkcoDir } from "../config.js";
import * as output from "../output.js";
import {
  deserializeManifest,
  createManifest,
  serializeManifest,
} from "../../protocol/manifest.js";

function manifestsDir(): string {
  return path.join(getSparkcoDir(), "manifests");
}

function loadManifest(
  version: string,
): ReturnType<typeof deserializeManifest> | null {
  const filePath = path.join(manifestsDir(), `${version}.json`);
  if (!fs.existsSync(filePath)) return null;
  return deserializeManifest(fs.readFileSync(filePath, "utf-8"));
}

function getCurrentManifest(): ReturnType<typeof deserializeManifest> | null {
  const dir = manifestsDir();
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;
  const latest = files[files.length - 1];
  return deserializeManifest(
    fs.readFileSync(path.join(dir, latest), "utf-8"),
  );
}

export async function manifestCommand(
  action: string,
  version?: string,
): Promise<void> {
  switch (action) {
    case "show":
    case "":
    case undefined: {
      const manifest = getCurrentManifest();
      if (!manifest) {
        output.print(
          { manifest: null },
          () => "No manifest found. System hasn't synced yet.",
        );
        return;
      }
      output.print(manifest, (data) => JSON.stringify(data, null, 2));
      break;
    }

    case "history": {
      const dir = manifestsDir();
      if (!fs.existsSync(dir)) {
        output.print({ versions: [] }, () => "No manifest history.");
        return;
      }
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort();
      if (files.length === 0) {
        output.print({ versions: [] }, () => "No manifest history.");
        return;
      }
      const rows: string[][] = [];
      for (const file of files) {
        try {
          const m = deserializeManifest(
            fs.readFileSync(path.join(dir, file), "utf-8"),
          );
          rows.push([
            m.version,
            new Date(m.timestamp).toISOString(),
            m.rollback_to ?? "-",
          ]);
        } catch {
          rows.push([file.replace(".json", ""), "?", "?"]);
        }
      }
      output.table(["version", "timestamp", "rollback_to"], rows);
      break;
    }

    case "rollback": {
      if (!version) {
        output.error("Usage: sparkco manifest rollback <version>");
        return;
      }
      const target = loadManifest(version);
      if (!target) {
        output.error(`Version ${version} not found.`);
        return;
      }

      const current = getCurrentManifest();
      const newManifest = createManifest(
        target.server,
        target.client,
        current?.version,
      );

      const dir = manifestsDir();
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${newManifest.version}.json`),
        serializeManifest(newManifest),
      );
      output.success(
        `Rolled back to ${version} (new version: ${newManifest.version})`,
      );
      break;
    }

    default:
      output.error(
        `Unknown action: ${action}. Use: show, history, rollback`,
      );
  }
}

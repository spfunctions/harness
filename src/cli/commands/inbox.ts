import * as fs from "node:fs";
import * as path from "node:path";
import { getSparkcoDir } from "../config.js";
import * as output from "../output.js";

export async function inboxCommand(
  action: string,
  id?: string,
): Promise<void> {
  const inboxDir = path.join(getSparkcoDir(), "inbox");
  if (!fs.existsSync(inboxDir)) {
    fs.mkdirSync(inboxDir, { recursive: true });
  }

  switch (action) {
    case "list":
    case "":
    case undefined:
      listInbox(inboxDir);
      break;
    case "view":
      if (!id) {
        output.error("Usage: sparkco inbox view <id>");
        return;
      }
      viewInbox(inboxDir, id);
      break;
    case "clear":
      clearInbox(inboxDir);
      break;
    default:
      output.error(`Unknown action: ${action}. Use: list, view, clear`);
  }
}

function listInbox(inboxDir: string): void {
  const files = fs
    .readdirSync(inboxDir)
    .filter((f) => f.endsWith(".json"));

  if (files.length === 0) {
    output.print({ items: [] }, () => "No pending requests.");
    return;
  }

  const rows: string[][] = [];
  for (const file of files) {
    try {
      const msg = JSON.parse(
        fs.readFileSync(path.join(inboxDir, file), "utf-8"),
      );
      rows.push([
        msg.id ?? file.replace(".json", ""),
        msg.from ?? "unknown",
        msg.description ?? msg.type ?? "",
        msg.timestamp ? new Date(msg.timestamp).toISOString() : "",
      ]);
    } catch {
      rows.push([file.replace(".json", ""), "?", "?", "?"]);
    }
  }

  output.table(["id", "from", "description", "timestamp"], rows);
}

function viewInbox(inboxDir: string, id: string): void {
  const filePath = path.join(inboxDir, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    output.error(`Request ${id} not found in inbox.`);
    return;
  }

  const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  output.print(content, (data) => JSON.stringify(data, null, 2));
}

function clearInbox(inboxDir: string): void {
  const files = fs
    .readdirSync(inboxDir)
    .filter((f) => f.endsWith(".json"));
  for (const file of files) {
    fs.unlinkSync(path.join(inboxDir, file));
  }
  output.success(`Cleared ${files.length} inbox item(s).`);
}

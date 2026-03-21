import * as output from "../output.js";
import { loadConfig, getDaemonPid } from "../config.js";

export async function psCommand(
  action: string,
  name?: string,
): Promise<void> {
  const config = loadConfig();
  const pid = getDaemonPid();

  if (!pid) {
    output.error(
      "Daemon not running. Start it with: sparkco daemon start",
    );
    return;
  }

  switch (action) {
    case "list":
    case "":
    case undefined:
      // In Phase 1, we read process info from daemon state
      // For now, output a basic status
      output.print(
        { processes: [], note: "Process list requires daemon IPC (Phase 2)" },
        () => "Process management requires a running daemon with IPC. Use 'sparkco status' for overview.",
      );
      break;

    case "start":
      if (!name) {
        output.error("Usage: sparkco ps start <name>");
        return;
      }
      output.warn(
        `Process start via CLI requires daemon IPC. Declare processes in manifest and use 'sparkco manifest' to sync.`,
      );
      break;

    case "stop":
      if (!name) {
        output.error("Usage: sparkco ps stop <name>");
        return;
      }
      output.warn("Process stop via CLI requires daemon IPC.");
      break;

    case "restart":
      if (!name) {
        output.error("Usage: sparkco ps restart <name>");
        return;
      }
      output.warn("Process restart via CLI requires daemon IPC.");
      break;

    default:
      output.error(
        `Unknown action: ${action}. Use: list, start, stop, restart`,
      );
  }
}

import { loadConfig, saveConfig } from "../config.js";
import * as output from "../output.js";

export async function routesCommand(
  action: string,
  routePath?: string,
): Promise<void> {
  const config = loadConfig();

  switch (action) {
    case "list":
    case "":
    case undefined:
      if (config.client.routes.length === 0) {
        output.print(
          { routes: [] },
          () => "No active routes.",
        );
      } else {
        output.table(
          ["path"],
          config.client.routes.map((r) => [r]),
        );
      }
      break;

    case "add":
      if (!routePath) {
        output.error("Usage: sparkco routes add <path>");
        return;
      }
      if (config.client.routes.includes(routePath)) {
        output.error(`Route ${routePath} already exists.`);
        return;
      }
      config.client.routes.push(routePath);
      saveConfig(config);
      output.success(`Added route: ${routePath}`);
      break;

    case "remove":
      if (!routePath) {
        output.error("Usage: sparkco routes remove <path>");
        return;
      }
      {
        const idx = config.client.routes.indexOf(routePath);
        if (idx === -1) {
          output.error(`Route ${routePath} not found.`);
          return;
        }
        config.client.routes.splice(idx, 1);
        saveConfig(config);
        output.success(`Removed route: ${routePath}`);
      }
      break;

    default:
      output.error(
        `Unknown action: ${action}. Use: list, add, remove`,
      );
  }
}

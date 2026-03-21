import { Command } from "commander";
import { setFormat } from "./output.js";
import { initInteractive, initNonInteractive } from "./init.js";
import { statusCommand } from "./commands/status.js";
import { sendCommand } from "./commands/send.js";
import { inboxCommand } from "./commands/inbox.js";
import { routesCommand } from "./commands/routes.js";
import { psCommand } from "./commands/processes.js";
import { manifestCommand } from "./commands/manifest.js";
import { logsCommand } from "./commands/logs.js";
import { deployCommand } from "./commands/deploy.js";
import { secretCommand } from "./commands/secret.js";
import { daemonCommand } from "./commands/daemon-cmd.js";
import { destroyCommand } from "./commands/destroy.js";
import { modelCommand } from "./commands/model.js";

const program = new Command()
  .name("sparkco")
  .description("Dual pi-agent runtime harness")
  .version("0.1.0")
  .option("--json", "Output in JSON format")
  .hook("preAction", (thisCommand) => {
    if (thisCommand.opts().json) {
      setFormat("json");
    }
  });

program
  .command("init")
  .description("Interactive setup wizard")
  .option("--non-interactive", "Non-interactive mode (uses env vars)")
  .action(async (opts) => {
    if (opts.nonInteractive) {
      await initNonInteractive();
    } else {
      await initInteractive();
    }
  });

program
  .command("status")
  .description("System status overview")
  .action(statusCommand);

program
  .command("daemon <action>")
  .description("Manage client daemon (start|stop|restart)")
  .option("-d, --detached", "Run in background")
  .action(async (action, opts) => {
    await daemonCommand(action, opts);
  });

program
  .command("send <type> [content]")
  .description("Send a protocol message")
  .option("--ref <id>", "Reference message ID")
  .option("--channel <ch>", "Data channel")
  .action(async (type, content, opts) => {
    await sendCommand(type, content ?? "", opts);
  });

program
  .command("inbox [action] [id]")
  .description("View pending requests (list|view|clear)")
  .action(async (action, id) => {
    await inboxCommand(action, id);
  });

program
  .command("routes [action] [path]")
  .description("Manage local endpoints (list|add|remove)")
  .action(async (action, routePath) => {
    await routesCommand(action, routePath);
  });

program
  .command("ps [action] [name]")
  .description("Process management (list|start|stop|restart)")
  .action(async (action, name) => {
    await psCommand(action, name);
  });

program
  .command("manifest [action] [version]")
  .description("Version management (show|history|rollback)")
  .action(async (action, version) => {
    await manifestCommand(action, version);
  });

program
  .command("logs [name]")
  .description("View logs")
  .option("--tail", "Follow log output")
  .option("--lines <n>", "Number of lines to show", "50")
  .action(async (name, opts) => {
    await logsCommand(name, {
      tail: opts.tail,
      lines: parseInt(opts.lines, 10),
    });
  });

program
  .command("deploy")
  .description("Deploy/redeploy server Worker")
  .option("--status", "Check deployment status")
  .action(async (opts) => {
    await deployCommand(opts);
  });

program
  .command("secret <action> [name] [value]")
  .description("Manage secrets (set|get|list|delete)")
  .action(async (action, name, value) => {
    await secretCommand(action, name, value);
  });

program
  .command("model [action] [target] [value]")
  .description("Manage LLM models (show|set|list|key|test)")
  .action(async (action, target, value) => {
    await modelCommand(action, target, value);
  });

program
  .command("destroy")
  .description("Tear down everything")
  .option("--force", "Skip confirmation")
  .action(async (opts) => {
    await destroyCommand(opts);
  });

export { program };

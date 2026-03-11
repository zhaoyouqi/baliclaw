import { Command } from "commander";
import { runConfigGetCommand } from "./commands/config.js";
import { runDaemonCommand } from "./commands/daemon.js";
import { runPairingListCommand } from "./commands/pairing.js";
import { runStatusCommand } from "./commands/status.js";

const program = new Command();

program.name("baliclaw").description("BaliClaw Phase 1 CLI scaffold");

program
  .command("status")
  .description("Show daemon status")
  .action(async () => {
    console.log(await runStatusCommand());
  });

program
  .command("config:get")
  .description("Print the current config")
  .action(async () => {
    console.log(await runConfigGetCommand());
  });

program
  .command("pairing:list")
  .description("List approved pairings")
  .action(async () => {
    console.log(await runPairingListCommand());
  });

program
  .command("daemon:start")
  .description("Explain how to start the daemon")
  .action(async () => {
    console.log(await runDaemonCommand());
  });

await program.parseAsync(process.argv);


#!/usr/bin/env node

import { Command } from "commander";
import { runConfigGetCommand, runConfigSetCommand } from "./commands/config.js";
import { runDaemonCommand } from "./commands/daemon.js";
import { runPairingApproveCommand, runPairingListCommand } from "./commands/pairing.js";
import { runStatusCommand } from "./commands/status.js";
import { runTuiCommand } from "./commands/tui.js";

const program = new Command();

program
  .name("baliclaw")
  .description("BaliClaw Phase 1 CLI scaffold")
  .showHelpAfterError();

program
  .command("status")
  .description("Show daemon status")
  .action(async () => {
    console.log(await runStatusCommand());
  });


program
  .command("tui")
  .description("Run a local terminal chat interface")
  .action(async () => {
    await runTuiCommand();
  });

const configCommand = program
  .command("config")
  .description("Read or update daemon configuration");

configCommand
  .command("get")
  .description("Print the current config")
  .action(async () => {
    console.log(await runConfigGetCommand());
  });

configCommand
  .command("set")
  .description("Set the current config from inline JSON5, a file, or a single config path")
  .argument("[config]", "inline JSON5 payload or value when used with --path")
  .option("-f, --file <path>", "read the config payload from a file")
  .option("-p, --path <config.path>", "update a single config path, for example channels.telegram.botToken")
  .action(async (config: string | undefined, options: { file?: string; path?: string }) => {
    console.log(await runConfigSetCommand(config, options));
  });

const pairingCommand = program
  .command("pairing")
  .description("Pairing request operations");

pairingCommand
  .command("list")
  .description("List pending pairing requests for a channel")
  .argument("<channel>", "pairing channel, for example telegram")
  .action(async (channel: string) => {
    console.log(await runPairingListCommand(channel));
  });

pairingCommand
  .command("approve")
  .description("Approve a pairing code for a channel")
  .argument("<channel>", "pairing channel, for example telegram")
  .argument("<code>", "pairing code to approve")
  .action(async (channel: string, code: string) => {
    console.log(await runPairingApproveCommand(channel, code));
  });

const daemonCommand = program
  .command("daemon")
  .description("Daemon process helpers");

daemonCommand
  .command("start")
  .description("Explain how to start the daemon")
  .action(async () => {
    console.log(await runDaemonCommand());
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  const message = error instanceof Error ? error.message : "CLI command failed";
  console.error(message);
  process.exitCode = 1;
}

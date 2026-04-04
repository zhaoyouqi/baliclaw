import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { AppConfig } from "../../config/schema.js";
import { ConfigService } from "../../config/service.js";
import { AgentService } from "../../runtime/agent-service.js";
import type { AgentRunOptions } from "../../runtime/agent-service.js";
import type { InboundMessage } from "../../shared/types.js";

const localChannel = "telegram" as const;
const localAccount = "default" as const;
const localChatType = "direct" as const;
const localSenderId = "local-operator";
const localConversationId = "local-tui";

const helpText = [
  "Commands:",
  "  /help  Show this help.",
  "  /new   Start a fresh Claude session.",
  "  /exit  Quit the TUI.",
  "  /quit  Quit the TUI."
].join("\n");

export type TuiControlCommand = "help" | "new" | "exit" | "quit";

export interface TuiCommandDependencies {
  configService?: Pick<ConfigService, "load">;
  agentService?: Pick<AgentService, "handleMessage">;
  createSessionId?: () => string;
  now?: () => Date;
  createReadline?: () => Interface;
  writeLine?: (line: string) => void;
}

export interface ParsedTuiInput {
  prompt?: string;
  command?: TuiControlCommand;
}

export async function runTuiCommand(dependencies: TuiCommandDependencies = {}): Promise<string> {
  const configService = dependencies.configService ?? new ConfigService();
  const agentService = dependencies.agentService ?? new AgentService();
  const writeLine = dependencies.writeLine ?? ((line: string) => stdout.write(`${line}\n`));

  const config = await configService.load();
  let sessionId = (dependencies.createSessionId ?? (() => createTuiSessionId(dependencies.now?.())) )();

  writeLine("BaliClaw local TUI started.");
  writeLine("Type your prompt, or use /help for commands.");

  const readline =
    dependencies.createReadline?.() ??
    createInterface({
      input: stdin,
      output: stdout
    });

  try {
    while (true) {
      const raw = await readline.question("you> ");
      const input = parseTuiInput(raw);

      if (input.command) {
        if (input.command === "help") {
          writeLine(helpText);
          continue;
        }

        if (input.command === "new") {
          sessionId = (dependencies.createSessionId ?? (() => createTuiSessionId(dependencies.now?.())) )();
          writeLine("Started a fresh local session.");
          continue;
        }

        if (input.command === "exit" || input.command === "quit") {
          writeLine("Bye.");
          break;
        }
      }

      if (!input.prompt) {
        continue;
      }

      const reply = await agentService.handleMessage(
        {
          channel: localChannel,
          accountId: localAccount,
          chatType: localChatType,
          conversationId: localConversationId,
          senderId: localSenderId,
          text: input.prompt
        },
        buildTuiAgentRunOptions(config, sessionId)
      );

      writeLine(`assistant> ${reply}`);
    }
  } finally {
    readline.close();
  }

  return "TUI closed.";
}

export function parseTuiInput(raw: string): ParsedTuiInput {
  const text = raw.trim();
  if (!text) {
    return {};
  }

  if (text === "/help") {
    return { command: "help" };
  }
  if (text === "/new") {
    return { command: "new" };
  }
  if (text === "/exit") {
    return { command: "exit" };
  }
  if (text === "/quit") {
    return { command: "quit" };
  }

  return { prompt: text };
}

export function buildTuiAgentRunOptions(config: AppConfig, sessionId: string): AgentRunOptions {
  const options: AgentRunOptions = {
    cwd: config.runtime.workingDirectory,
    sessionId,
    loadFilesystemSettings: config.runtime.loadFilesystemSettings,
    tools: config.tools.availableTools,
    memoryEnabled: config.memory.enabled,
    memoryMaxLines: config.memory.maxLines
  };

  if (config.runtime.model) {
    options.model = config.runtime.model;
  }
  if (config.runtime.maxTurns !== undefined) {
    options.maxTurns = config.runtime.maxTurns;
  }
  if (config.runtime.systemPromptFile) {
    options.systemPromptFile = config.runtime.systemPromptFile;
  }
  if (config.runtime.soulFile) {
    options.soulFile = config.runtime.soulFile;
  }
  if (config.runtime.userFile) {
    options.userFile = config.runtime.userFile;
  }

  if (config.skills.enabled) {
    options.skillDirectories = config.skills.directories;
  }
  if (Object.keys(config.mcp.servers).length > 0) {
    options.mcpServers = config.mcp.servers;
  }
  if (Object.keys(config.agents).length > 0) {
    options.agents = config.agents;
  }

  return options;
}

export function createLocalTuiMessage(prompt: string): InboundMessage {
  return {
    channel: localChannel,
    accountId: localAccount,
    chatType: localChatType,
    conversationId: localConversationId,
    senderId: localSenderId,
    text: prompt
  };
}

export function createTuiSessionId(now: Date = new Date()): string {
  return `tui-${now.toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
}

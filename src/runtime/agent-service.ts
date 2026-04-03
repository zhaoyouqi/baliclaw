import type { Logger } from "pino";
import type { McpServerConfig as SdkMcpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { InboundMessage } from "../shared/types.js";
import { buildTelegramDirectSessionId } from "../session/stable-key.js";
import { getLogger } from "../shared/logger.js";
import { queryAgent, type QueryRequest } from "./sdk.js";
import { ClaudeSessionMapStore } from "./session-map-store.js";

export interface AgentRunOptions {
  cwd: string;
  sessionId?: string;
  model?: string;
  maxTurns?: number;
  systemPromptFile?: string;
  skillDirectories?: string[];
  tools?: string[];
  mcpServers?: Record<string, SdkMcpServerConfig>;
  sdkNativeSkills?: boolean;
}

export interface AgentServiceDependencies {
  logger?: Logger;
  runQueryAgent?: typeof queryAgent;
  sessionMapStore?: Pick<ClaudeSessionMapStore, "get" | "set">;
}

const genericAgentFailureMessage = "Sorry, I ran into an internal error while processing your request.";
const maxTurnsFailureMessage = "Sorry, I couldn't finish that within the allowed turn limit.";

export class AgentService {
  private readonly logger: Logger;
  private readonly runQueryAgent: typeof queryAgent;
  private readonly sessionMapStore: Pick<ClaudeSessionMapStore, "get" | "set">;

  constructor(dependencies: AgentServiceDependencies = {}) {
    this.logger = dependencies.logger ?? getLogger("agent");
    this.runQueryAgent = dependencies.runQueryAgent ?? queryAgent;
    this.sessionMapStore = dependencies.sessionMapStore ?? new ClaudeSessionMapStore();
  }

  async handleMessage(
    message: InboundMessage,
    optionsOrCwd: string | AgentRunOptions,
    sessionIdOverride?: string
  ): Promise<string> {
    const options = normalizeAgentRunOptions(message, optionsOrCwd, sessionIdOverride);

    try {
      const resumeSessionId = await this.sessionMapStore.get(options.sessionId);
      const request: QueryRequest = {
        prompt: message.text,
        sessionId: options.sessionId,
        cwd: options.cwd
      };

      if (resumeSessionId) {
        request.resumeSessionId = resumeSessionId;
      }

      if (options.model) {
        request.model = options.model;
      }
      if (options.maxTurns !== undefined) {
        request.maxTurns = options.maxTurns;
      }
      if (options.systemPromptFile) {
        request.systemPromptFile = options.systemPromptFile;
      }
      if (options.skillDirectories) {
        request.skillDirectories = options.skillDirectories;
      }
      if (options.tools) {
        request.tools = options.tools;
      }
      if (options.mcpServers) {
        request.mcpServers = options.mcpServers;
      }
      if (options.sdkNativeSkills !== undefined) {
        request.sdkNativeSkills = options.sdkNativeSkills;
      }

      const result = await this.runQueryAgent(request);
      await this.sessionMapStore.set(options.sessionId, result.sessionId);
      return result.text;
    } catch (error) {
      this.logger.error(
        {
          err: error,
          senderId: message.senderId,
          conversationId: message.conversationId,
          sessionId: options.sessionId,
          cwd: options.cwd
        },
        "agent execution failed"
      );
      return toUserFacingFailureMessage(error);
    }
  }
}

function normalizeAgentRunOptions(
  message: InboundMessage,
  optionsOrCwd: string | AgentRunOptions,
  sessionIdOverride?: string
): Required<Pick<AgentRunOptions, "cwd" | "sessionId">> & Omit<AgentRunOptions, "cwd" | "sessionId"> {
  if (typeof optionsOrCwd === "string") {
    return {
      cwd: optionsOrCwd,
      sessionId: sessionIdOverride ?? buildTelegramDirectSessionId(message)
    };
  }

  return {
    ...optionsOrCwd,
    cwd: optionsOrCwd.cwd,
    sessionId: optionsOrCwd.sessionId ?? buildTelegramDirectSessionId(message)
  };
}

function toUserFacingFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes("max turns")) {
    return maxTurnsFailureMessage;
  }

  return genericAgentFailureMessage;
}

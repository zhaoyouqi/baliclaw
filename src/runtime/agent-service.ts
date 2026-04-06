import type { Logger } from "pino";
import type { McpServerConfig as SdkMcpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { AgentDefinitionConfig } from "../config/schema.js";
import type { InboundMessage } from "../shared/types.js";
import { buildTelegramDirectSessionId } from "../session/stable-key.js";
import { getLogger } from "../shared/logger.js";
import { queryAgent, type QueryRequest } from "./sdk.js";
import { SessionContextStore } from "./session-context-store.js";
import { ClaudeSessionMapStore } from "./session-map-store.js";

export interface AgentRunOptions {
  cwd: string;
  sessionId?: string;
  model?: string;
  maxTurns?: number;
  systemPromptFile?: string;
  soulFile?: string;
  userFile?: string;
  skillDirectories?: string[];
  tools?: string[];
  mcpServers?: Record<string, SdkMcpServerConfig>;
  loadFilesystemSettings?: boolean;
  agents?: Record<string, AgentDefinitionConfig>;
  memoryEnabled?: boolean;
  memoryMaxLines?: number;
}

export interface AgentServiceDependencies {
  logger?: Logger;
  runQueryAgent?: typeof queryAgent;
  sessionMapStore?: Pick<ClaudeSessionMapStore, "get" | "set" | "delete">;
  sessionContextStore?: Pick<SessionContextStore, "get" | "set" | "delete">;
}

export interface AgentMessageResult {
  text: string;
  autoCompacted?: boolean;
  autoCompactionPreTokens?: number;
}

const genericAgentFailureMessage = "Sorry, I ran into an internal error while processing your request.";
const maxTurnsFailureMessage =
  "Sorry, I hit the turn limit before I could finish. The task may be partially complete. Please try again, or increase runtime.maxTurns for longer multi-step tasks.";
const permissionDeniedPrefix = "Sorry, Claude Code denied the requested operation: ";

export class AgentService {
  private readonly logger: Logger;
  private readonly runQueryAgent: typeof queryAgent;
  private readonly sessionMapStore: Pick<ClaudeSessionMapStore, "get" | "set" | "delete">;
  private readonly sessionContextStore: Pick<SessionContextStore, "get" | "set" | "delete">;

  constructor(dependencies: AgentServiceDependencies = {}) {
    this.logger = dependencies.logger ?? getLogger("agent");
    this.runQueryAgent = dependencies.runQueryAgent ?? queryAgent;
    this.sessionMapStore = dependencies.sessionMapStore ?? new ClaudeSessionMapStore();
    this.sessionContextStore = dependencies.sessionContextStore ?? new SessionContextStore();
  }

  async handleMessage(
    message: InboundMessage,
    optionsOrCwd: string | AgentRunOptions,
    sessionIdOverride?: string
  ): Promise<string> {
    const result = await this.handleMessageWithMetadata(message, optionsOrCwd, sessionIdOverride);
    return result.text;
  }

  async handleMessageWithMetadata(
    message: InboundMessage,
    optionsOrCwd: string | AgentRunOptions,
    sessionIdOverride?: string
  ): Promise<AgentMessageResult> {
    const options = normalizeAgentRunOptions(message, optionsOrCwd, sessionIdOverride);

    try {
      const resumeSessionId = await this.sessionMapStore.get(options.sessionId);
      const result = await this.runQueryAgent(createQueryRequest(message.text, options, resumeSessionId));
      await this.sessionMapStore.set(options.sessionId, result.sessionId);
      this.updateSessionContext(options.sessionId, result);
      return {
        text: result.text,
        ...(result.compaction?.trigger === "auto"
          ? {
              autoCompacted: true,
              autoCompactionPreTokens: result.compaction.preTokens
            }
          : {})
      };
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
      return {
        text: toUserFacingFailureMessage(error)
      };
    }
  }

  async resetSession(sessionId: string): Promise<void> {
    await this.sessionMapStore.delete(sessionId);
    this.sessionContextStore.delete(sessionId);
  }

  async compactSession(
    message: InboundMessage,
    optionsOrCwd: string | AgentRunOptions,
    sessionIdOverride?: string
  ): Promise<string> {
    const options = normalizeAgentRunOptions(message, optionsOrCwd, sessionIdOverride);

    try {
      const resumeSessionId = await this.sessionMapStore.get(options.sessionId);
      if (!resumeSessionId) {
        return "No active session to compact yet. Send a message first.";
      }

      const result = await this.runCompactCommand(options, resumeSessionId);
      const preTokens = result.compaction?.preTokens;
      if (typeof preTokens === "number") {
        return `Compacted the current session. Previous context was about ${preTokens} tokens.`;
      }

      return "Compacted the current session.";
    } catch (error) {
      this.logger.error(
        {
          err: error,
          senderId: message.senderId,
          conversationId: message.conversationId,
          sessionId: options.sessionId,
          cwd: options.cwd
        },
        "session compaction failed"
      );
      return toUserFacingFailureMessage(error);
    }
  }

  private async runCompactCommand(
    options: Required<Pick<AgentRunOptions, "cwd" | "sessionId">> & Omit<AgentRunOptions, "cwd" | "sessionId">,
    resumeSessionId: string
  ) {
    const result = await this.runQueryAgent(
      createQueryRequest("/compact", { ...options, maxTurns: 1 }, resumeSessionId)
    );
    await this.sessionMapStore.set(options.sessionId, result.sessionId);
    this.updateSessionContext(options.sessionId, result);
    return result;
  }

  private updateSessionContext(
    sessionId: string,
    result: Awaited<ReturnType<typeof queryAgent>>
  ): void {
    const previous = this.sessionContextStore.get(sessionId);
    const updatedAt = new Date().toISOString();
    const snapshot: SessionContextSnapshot = {
      estimatedInputTokens: result.compaction
        ? undefined
        : result.usage?.estimatedInputTokens ?? previous?.estimatedInputTokens,
      compacting: result.compacting ?? false,
      updatedAt
    };

    if (result.compaction) {
      snapshot.lastCompaction = {
        trigger: result.compaction.trigger,
        preTokens: result.compaction.preTokens,
        compactedAt: updatedAt
      };
    } else if (previous?.lastCompaction) {
      snapshot.lastCompaction = previous.lastCompaction;
    }

    this.sessionContextStore.set(sessionId, snapshot);
  }
}

function createQueryRequest(
  prompt: string,
  options: Required<Pick<AgentRunOptions, "cwd" | "sessionId">> & Omit<AgentRunOptions, "cwd" | "sessionId">,
  resumeSessionId?: string
): QueryRequest {
  const request: QueryRequest = {
    prompt,
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
  if (options.soulFile) {
    request.soulFile = options.soulFile;
  }
  if (options.userFile) {
    request.userFile = options.userFile;
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
  if (options.loadFilesystemSettings !== undefined) {
    request.loadFilesystemSettings = options.loadFilesystemSettings;
  }
  if (options.agents) {
    request.agents = options.agents;
  }
  if (options.memoryEnabled !== undefined) {
    request.memoryEnabled = options.memoryEnabled;
  }
  if (options.memoryMaxLines !== undefined) {
    request.memoryMaxLines = options.memoryMaxLines;
  }

  return request;
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
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.toLowerCase();

  if (message.includes("max turns") || message.includes("error_max_turns")) {
    return maxTurnsFailureMessage;
  }

  const permissionDeniedReason = extractPermissionDeniedReason(rawMessage);
  if (permissionDeniedReason) {
    return `${permissionDeniedPrefix}${permissionDeniedReason}`;
  }

  const rootCause = extractRootCause(rawMessage);
  return rootCause ? `${genericAgentFailureMessage} Root cause: ${rootCause}` : genericAgentFailureMessage;
}

function extractPermissionDeniedReason(message: string): string | null {
  const firstLine = extractRootCause(message);
  if (!firstLine) {
    return null;
  }

  const normalized = firstLine.toLowerCase();
  if (!normalized.includes("permission to use")) {
    return null;
  }

  const sdkPrefix = "Claude Agent SDK failed: ";
  if (firstLine.startsWith(sdkPrefix)) {
    return firstLine.slice(sdkPrefix.length).trim();
  }

  return firstLine;
}

function extractRootCause(message: string): string | null {
  const firstLine = message.split("\n")[0]?.trim();
  if (!firstLine) {
    return null;
  }

  const sdkPrefix = "Claude Agent SDK failed: ";
  if (firstLine.startsWith(sdkPrefix)) {
    return firstLine.slice(sdkPrefix.length).trim();
  }

  return firstLine;
}

import type { Logger } from "pino";
import type { McpServerConfig as SdkMcpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { AgentDefinitionConfig } from "../config/schema.js";
import type { InboundMessage } from "../shared/types.js";
import { buildDefaultSessionKey } from "../session/stable-key.js";
import { getLogger } from "../shared/logger.js";
import { queryAgent, type QueryRequest } from "./sdk.js";
import {
  SessionContextStore,
  type SessionContextSnapshot,
  type SessionTodoItem
} from "./session-context-store.js";
import { ClaudeSessionMapStore } from "./session-map-store.js";

export interface AgentRunOptions {
  cwd: string;
  sessionId?: string;
  abortController?: AbortController;
  interactionContext?: string;
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

export type ScheduledAgentRunOptions = Required<Pick<AgentRunOptions, "cwd" | "sessionId">> &
  Omit<AgentRunOptions, "cwd" | "sessionId">;

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
  todoNotice?: string;
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
      const previousTodo = this.sessionContextStore.get(options.sessionId)?.todo?.todos;
      const result = await this.runQueryAgent(createQueryRequest(message.text, options, resumeSessionId));
      await this.sessionMapStore.set(options.sessionId, result.sessionId);
      const todoNotice = this.buildTodoNotice(previousTodo, result.todo);
      this.updateSessionContext(options.sessionId, result);
      return {
        text: result.text,
        ...(result.compaction?.trigger === "auto"
          ? {
              autoCompacted: true,
              autoCompactionPreTokens: result.compaction.preTokens
            }
          : {}),
        ...(todoNotice ? { todoNotice } : {})
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

  getTodoSummary(sessionId: string): string {
    const todo = this.sessionContextStore.get(sessionId)?.todo;
    if (!todo || todo.todos.length === 0) {
      return "No task list is available for the current session yet.";
    }

    const completedCount = todo.todos.filter((item) => item.status === "completed").length;
    return [
      "## Task List",
      `**${completedCount}/${todo.todos.length} completed**`,
      ...todo.todos.map((item, index) => `${index + 1}. ${renderTodoStatus(item.status)} ${item.status === "in_progress" ? `**${item.activeForm}**` : item.content}`)
    ].join("\n");
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

  async runPrompt(
    prompt: string,
    options: ScheduledAgentRunOptions
  ): Promise<AgentMessageResult> {
    try {
      const result = await this.runQueryAgent(createQueryRequest(prompt, options));
      const todoNotice = result.todo ? this.buildTodoNotice(undefined, result.todo) : undefined;
      return {
        text: result.text,
        ...(result.compaction?.trigger === "auto"
          ? {
              autoCompacted: true,
              autoCompactionPreTokens: result.compaction.preTokens
            }
          : {}),
        ...(todoNotice ? { todoNotice } : {})
      };
    } catch (error) {
      this.logger.error(
        {
          err: error,
          sessionId: options.sessionId,
          cwd: options.cwd
        },
        "scheduled agent execution failed"
      );
      throw error;
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
    const estimatedInputTokens = result.compaction
      ? undefined
      : result.usage?.estimatedInputTokens ?? previous?.estimatedInputTokens;
    const snapshot: SessionContextSnapshot = {
      compacting: result.compacting ?? false,
      updatedAt
    };

    if (estimatedInputTokens !== undefined) {
      snapshot.estimatedInputTokens = estimatedInputTokens;
    }

    if (result.compaction) {
      snapshot.lastCompaction = {
        trigger: result.compaction.trigger,
        preTokens: result.compaction.preTokens,
        compactedAt: updatedAt
      };
    } else if (previous?.lastCompaction) {
      snapshot.lastCompaction = previous.lastCompaction;
    }

    if (result.todo) {
      snapshot.todo = {
        todos: result.todo,
        updatedAt
      };
    } else if (previous?.todo) {
      snapshot.todo = previous.todo;
    }

    this.sessionContextStore.set(sessionId, snapshot);
  }

  private buildTodoNotice(previousTodos: SessionTodoItem[] | undefined, nextTodos: SessionTodoItem[] | undefined): string | undefined {
    if (!nextTodos || nextTodos.length === 0) {
      return undefined;
    }

    const completedCount = nextTodos.filter((todo) => todo.status === "completed").length;
    const activeTodo = nextTodos.find((todo) => todo.status === "in_progress");
    const previousActiveTodo = previousTodos?.find((todo) => todo.status === "in_progress");
    const hadPreviousTodos = Boolean(previousTodos && previousTodos.length > 0);
    const previousAllCompleted = Boolean(
      previousTodos &&
      previousTodos.length > 0 &&
      previousTodos.every((todo) => todo.status === "completed")
    );
    const nextAllCompleted = nextTodos.every((todo) => todo.status === "completed");

    if (!hadPreviousTodos) {
      return `**Task plan created**\n${completedCount}/${nextTodos.length} completed.`;
    }

    if (!previousAllCompleted && nextAllCompleted) {
      return `**Task plan completed**\n${completedCount}/${nextTodos.length} done.`;
    }

    if (activeTodo && activeTodo.activeForm !== previousActiveTodo?.activeForm) {
      return `**Now working on:** ${activeTodo.activeForm}`;
    }

    return undefined;
  }
}

function renderTodoStatus(status: SessionTodoItem["status"]): string {
  if (status === "completed") {
    return "[x]";
  }

  if (status === "in_progress") {
    return "[>]";
  }

  return "[ ]";
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
  if (options.abortController) {
    request.abortController = options.abortController;
  }
  if (options.interactionContext) {
    request.interactionContext = options.interactionContext;
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
      sessionId: sessionIdOverride ?? buildDefaultSessionKey(message),
      interactionContext: buildInteractionContext(message)
    };
  }

  return {
    ...optionsOrCwd,
    cwd: optionsOrCwd.cwd,
    sessionId: optionsOrCwd.sessionId ?? buildDefaultSessionKey(message),
    interactionContext: optionsOrCwd.interactionContext ?? buildInteractionContext(message)
  };
}

function buildInteractionContext(message: InboundMessage): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return [
    "Current interaction metadata:",
    `- channel: ${message.channel}`,
    `- accountId: ${message.accountId}`,
    `- chatType: ${message.chatType}`,
    `- conversationId: ${message.conversationId}`,
    ...(message.threadId ? [`- threadId: ${message.threadId}`] : []),
    ...(message.messageId ? [`- messageId: ${message.messageId}`] : []),
    `- senderId: ${message.senderId}`,
    `- daemonTimezone: ${timezone}`,
    "",
    "If you create or update a scheduled task for this user, prefer the current conversation as the delivery target unless the user explicitly asks for a different target.",
    "Use the current channel, accountId, chatType, conversationId, and threadId (when present) for that delivery target.",
    "When the user mentions another timezone, convert it to daemonTimezone before creating the scheduled task."
  ].join("\n");
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

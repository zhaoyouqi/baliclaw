import { describe, expect, it, vi } from "vitest";
import { AgentService } from "../src/runtime/agent-service.js";
import { SessionContextStore } from "../src/runtime/session-context-store.js";
import { createLogger } from "../src/shared/logger.js";
import type { InboundMessage } from "../src/shared/types.js";

function makeMessage(text: string, senderId = "42"): InboundMessage {
  return {
    channel: "telegram",
    accountId: "default",
    chatType: "direct",
    conversationId: senderId,
    senderId,
    text
  };
}

describe("AgentService", () => {
  it("uses a stable session id and the provided cwd when calling the SDK wrapper", async () => {
    const queryAgent = vi.fn().mockResolvedValue({
      text: "done",
      sessionId: "claude-session-1"
    });
    const sessionMapStore = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    };
    const service = new AgentService({
      runQueryAgent: queryAgent,
      sessionMapStore
    });

    await expect(service.handleMessage(makeMessage("hello"), "/tmp/project")).resolves.toBe("done");

    expect(queryAgent).toHaveBeenCalledWith({
      prompt: "hello",
      sessionId: "telegram:default:direct:42",
      cwd: "/tmp/project"
    });
    expect(sessionMapStore.set).toHaveBeenCalledWith(
      "telegram:default:direct:42",
      "claude-session-1"
    );
  });

  it("passes advanced runtime options through to the SDK wrapper", async () => {
    const queryAgent = vi.fn().mockResolvedValue({
      text: "done",
      sessionId: "claude-session-2"
    });
    const sessionMapStore = {
      get: vi.fn().mockResolvedValue("claude-session-existing"),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    };
    const service = new AgentService({
      runQueryAgent: queryAgent,
      sessionMapStore
    });

    await service.handleMessage(makeMessage("hello"), {
      cwd: "/tmp/project",
      sessionId: "custom-session",
      model: "claude-sonnet",
      maxTurns: 12,
      systemPromptFile: "/tmp/system.md",
      soulFile: "/tmp/soul.md",
      userFile: "/tmp/user.md",
      skillDirectories: ["/tmp/skills"],
      tools: ["Read", "Bash"],
      loadFilesystemSettings: true,
      agents: {
        reviewer: {
          description: "Review code",
          prompt: "You review code."
        }
      },
      memoryEnabled: true,
      memoryMaxLines: 64
    });

    expect(queryAgent).toHaveBeenCalledWith({
      prompt: "hello",
      sessionId: "custom-session",
      resumeSessionId: "claude-session-existing",
      cwd: "/tmp/project",
      model: "claude-sonnet",
      maxTurns: 12,
      systemPromptFile: "/tmp/system.md",
      soulFile: "/tmp/soul.md",
      userFile: "/tmp/user.md",
      skillDirectories: ["/tmp/skills"],
      tools: ["Read", "Bash"],
      loadFilesystemSettings: true,
      agents: {
        reviewer: {
          description: "Review code",
          prompt: "You review code."
        }
      },
      memoryEnabled: true,
      memoryMaxLines: 64
    });
    expect(sessionMapStore.set).toHaveBeenCalledWith("custom-session", "claude-session-2");
  });

  it("returns a readable max-turns failure message and logs the error", async () => {
    const destination = { write: vi.fn(() => true) };
    const logger = createLogger({ subsystem: "agent", destination });
    const service = new AgentService({
      logger,
      runQueryAgent: vi.fn().mockRejectedValue(new Error("Claude Agent SDK failed: max turns reached")),
      sessionMapStore: {
        get: vi.fn().mockResolvedValue(undefined),
        set: vi.fn(),
        delete: vi.fn()
      }
    });

    await expect(service.handleMessage(makeMessage("hello"), "/tmp/project")).resolves.toBe(
      "Sorry, I hit the turn limit before I could finish. The task may be partially complete. Please try again, or increase runtime.maxTurns for longer multi-step tasks."
    );
    expect(destination.write).toHaveBeenCalled();
  });

  it("recognizes error_max_turns responses even when the SDK uses the subtype string", async () => {
    const destination = { write: vi.fn(() => true) };
    const logger = createLogger({ subsystem: "agent", destination });
    const service = new AgentService({
      logger,
      runQueryAgent: vi.fn().mockRejectedValue(new Error("Claude Agent SDK failed: error_max_turns")),
      sessionMapStore: {
        get: vi.fn().mockResolvedValue(undefined),
        set: vi.fn(),
        delete: vi.fn()
      }
    });

    await expect(service.handleMessage(makeMessage("hello"), "/tmp/project")).resolves.toBe(
      "Sorry, I hit the turn limit before I could finish. The task may be partially complete. Please try again, or increase runtime.maxTurns for longer multi-step tasks."
    );
    expect(destination.write).toHaveBeenCalled();
  });

  it("surfaces Claude Code permission denials in dontAsk mode to the user", async () => {
    const destination = { write: vi.fn(() => true) };
    const logger = createLogger({ subsystem: "agent", destination });
    const service = new AgentService({
      logger,
      runQueryAgent: vi.fn().mockRejectedValue(
        new Error(
          "Claude Agent SDK failed: Permission to use Bash has been denied because Claude Code is running in don't ask mode.\nClaude stderr: ignored"
        )
      ),
      sessionMapStore: {
        get: vi.fn().mockResolvedValue(undefined),
        set: vi.fn(),
        delete: vi.fn()
      }
    });

    await expect(service.handleMessage(makeMessage("hello"), "/tmp/project")).resolves.toBe(
      "Sorry, Claude Code denied the requested operation: Permission to use Bash has been denied because Claude Code is running in don't ask mode."
    );
    expect(destination.write).toHaveBeenCalled();
  });

  it("includes the root cause in the generic failure message for unexpected errors", async () => {
    const destination = { write: vi.fn(() => true) };
    const logger = createLogger({ subsystem: "agent", destination });
    const service = new AgentService({
      logger,
      runQueryAgent: vi.fn().mockRejectedValue(new Error("network broke")),
      sessionMapStore: {
        get: vi.fn().mockResolvedValue(undefined),
        set: vi.fn(),
        delete: vi.fn()
      }
    });

    await expect(service.handleMessage(makeMessage("hello"), "/tmp/project")).resolves.toBe(
      "Sorry, I ran into an internal error while processing your request. Root cause: network broke"
    );
    expect(destination.write).toHaveBeenCalled();
  });

  it("resets a session by deleting its Claude session mapping without running the agent", async () => {
    const queryAgent = vi.fn();
    const sessionMapStore = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined)
    };
    const service = new AgentService({
      runQueryAgent: queryAgent,
      sessionMapStore
    });

    await expect(service.resetSession("telegram:default:direct:42")).resolves.toBeUndefined();

    expect(sessionMapStore.delete).toHaveBeenCalledWith("telegram:default:direct:42");
    expect(queryAgent).not.toHaveBeenCalled();
  });

  it("reports when the SDK auto-compacted during a normal turn", async () => {
    const queryAgent = vi.fn().mockResolvedValue({
      text: "done",
      sessionId: "claude-session-existing",
      compaction: {
        trigger: "auto",
        preTokens: 170000
      },
      usage: {
        estimatedInputTokens: 1200
      }
    });
    const sessionMapStore = {
      get: vi.fn().mockResolvedValue("claude-session-existing"),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    };
    const service = new AgentService({
      runQueryAgent: queryAgent,
      sessionMapStore,
      sessionContextStore: new SessionContextStore()
    });

    await expect(service.handleMessageWithMetadata(makeMessage("hello"), "/tmp/project")).resolves.toEqual({
      text: "done",
      autoCompacted: true,
      autoCompactionPreTokens: 170000
    });

    expect(queryAgent).toHaveBeenCalledWith({
      prompt: "hello",
      sessionId: "telegram:default:direct:42",
      resumeSessionId: "claude-session-existing",
      cwd: "/tmp/project"
    });
  });

  it("compacts the current session on demand when a Claude session already exists", async () => {
    const queryAgent = vi.fn().mockResolvedValue({
      text: "Compacted",
      sessionId: "claude-session-existing",
      compaction: {
        trigger: "manual",
        preTokens: 45678
      }
    });
    const sessionMapStore = {
      get: vi.fn().mockResolvedValue("claude-session-existing"),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    };
    const service = new AgentService({
      runQueryAgent: queryAgent,
      sessionMapStore
    });

    await expect(service.compactSession(makeMessage("/compact"), "/tmp/project")).resolves.toBe(
      "Compacted the current session. Previous context was about 45678 tokens."
    );

    expect(queryAgent).toHaveBeenCalledWith({
      prompt: "/compact",
      sessionId: "telegram:default:direct:42",
      resumeSessionId: "claude-session-existing",
      cwd: "/tmp/project",
      maxTurns: 1
    });
  });

  it("returns a readable message when the user tries to compact before any active session exists", async () => {
    const queryAgent = vi.fn();
    const sessionMapStore = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    };
    const service = new AgentService({
      runQueryAgent: queryAgent,
      sessionMapStore
    });

    await expect(service.compactSession(makeMessage("/compact"), "/tmp/project")).resolves.toBe(
      "No active session to compact yet. Send a message first."
    );
    expect(queryAgent).not.toHaveBeenCalled();
  });
});

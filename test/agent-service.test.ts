import { describe, expect, it, vi } from "vitest";
import { AgentService } from "../src/runtime/agent-service.js";
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
      set: vi.fn().mockResolvedValue(undefined)
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
      set: vi.fn().mockResolvedValue(undefined)
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
        set: vi.fn()
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
        set: vi.fn()
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
        set: vi.fn()
      }
    });

    await expect(service.handleMessage(makeMessage("hello"), "/tmp/project")).resolves.toBe(
      "Sorry, Claude Code denied the requested operation: Permission to use Bash has been denied because Claude Code is running in don't ask mode."
    );
    expect(destination.write).toHaveBeenCalled();
  });

  it("returns a generic readable failure message for unexpected errors", async () => {
    const destination = { write: vi.fn(() => true) };
    const logger = createLogger({ subsystem: "agent", destination });
    const service = new AgentService({
      logger,
      runQueryAgent: vi.fn().mockRejectedValue(new Error("network broke")),
      sessionMapStore: {
        get: vi.fn().mockResolvedValue(undefined),
        set: vi.fn()
      }
    });

    await expect(service.handleMessage(makeMessage("hello"), "/tmp/project")).resolves.toBe(
      "Sorry, I ran into an internal error while processing your request."
    );
    expect(destination.write).toHaveBeenCalled();
  });
});

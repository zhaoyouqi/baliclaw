import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { bootstrap } from "../src/daemon/bootstrap.js";
import { runDaemon } from "../src/daemon/index.js";
import { createShutdownController } from "../src/daemon/shutdown.js";
import { getAppPaths } from "../src/config/paths.js";
import type { AppConfig } from "../src/config/schema.js";
import { createLogger } from "../src/shared/logger.js";
import type { InboundMessage } from "../src/shared/types.js";

interface RegisteredHandler {
  (context: { update: unknown }): unknown;
}

class FakeTelegramBot {
  handler: RegisteredHandler | undefined;
  start = vi.fn(async () => undefined);
  stop = vi.fn(async () => undefined);

  on(_filter: "message", handler: RegisteredHandler): void {
    this.handler = handler;
  }
}

class FakeProcess extends EventEmitter {
  exitCode: number | undefined;

  override on(event: "SIGINT" | "SIGTERM", listener: () => void): this {
    return super.on(event, listener);
  }

  override off(event: "SIGINT" | "SIGTERM", listener: () => void): this {
    return super.off(event, listener);
  }
}

const defaultConfig: AppConfig = {
  telegram: {
    enabled: false,
    botToken: ""
  },
  runtime: {
    workingDirectory: "/tmp/baliclaw"
  },
  tools: {
    availableTools: ["Bash", "Read", "Write", "Edit"]
  },
  skills: {
    enabled: true,
    directories: []
  },
  logging: {
    level: "info"
  }
};

describe("bootstrap", () => {
  it("creates state directories and loads config before returning context", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-bootstrap-"));
    const paths = getAppPaths(home);
    const ipcServer = {
      start: vi.fn<() => Promise<void>>().mockResolvedValue(),
      stop: vi.fn<() => Promise<void>>().mockResolvedValue()
    } as never;
    const configService = {
      load: vi.fn<() => Promise<AppConfig>>().mockResolvedValue(defaultConfig)
    } as never;

    try {
      const context = await bootstrap({ paths, configService, ipcServer });

      expect(context.paths).toEqual(paths);
      expect(context.config).toEqual(defaultConfig);
      expect(context.configService).toBe(configService);
      expect(ipcServer.start).toHaveBeenCalledTimes(1);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("starts telegram only when enabled and registers a stop hook", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-bootstrap-tg-"));
    const paths = getAppPaths(home);
    const ipcServer = {
      start: vi.fn<() => Promise<void>>().mockResolvedValue(),
      stop: vi.fn<() => Promise<void>>().mockResolvedValue()
    } as never;
    const telegramService = {
      start: vi.fn<() => Promise<void>>().mockResolvedValue(),
      stop: vi.fn<() => Promise<void>>().mockResolvedValue()
    } as never;

    try {
      const context = await bootstrap({
        paths,
        ipcServer,
        telegramService,
        configService: {
          load: vi.fn<() => Promise<AppConfig>>().mockResolvedValue({
            ...defaultConfig,
            telegram: {
              enabled: true,
              botToken: "secret"
            }
          })
        } as never
      });

      expect(telegramService.start).toHaveBeenCalledTimes(1);

      await context.shutdownController.shutdown();

      expect(telegramService.stop).toHaveBeenCalledTimes(1);
      expect(ipcServer.stop).toHaveBeenCalledTimes(1);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("routes approved telegram messages through session, agent, and telegram reply delivery", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-bootstrap-chain-"));
    const paths = getAppPaths(home);
    const bot = new FakeTelegramBot();
    const sendText = vi.fn<() => Promise<void>>().mockResolvedValue();
    const pairingService = {
      isApprovedSender: vi.fn().mockResolvedValue(true),
      getOrCreatePendingRequest: vi.fn()
    } as never;
    const sessionService = {
      runTurn: vi.fn(async (message: InboundMessage, handler: (message: InboundMessage, sessionId: string) => Promise<void>) =>
        handler(message, "telegram:default:direct:42"))
    } as never;
    const agentService = {
      handleMessage: vi.fn().mockResolvedValue("agent reply")
    } as never;

    try {
      await bootstrap({
        paths,
        telegramBot: bot,
        sendText,
        pairingService,
        sessionService,
        agentService,
        ipcServer: {
          start: vi.fn<() => Promise<void>>().mockResolvedValue(),
          stop: vi.fn<() => Promise<void>>().mockResolvedValue()
        } as never,
        configService: {
          load: vi.fn<() => Promise<AppConfig>>().mockResolvedValue({
            ...defaultConfig,
            telegram: {
              enabled: true,
              botToken: "secret"
            },
            runtime: {
              workingDirectory: "/tmp/runtime",
              model: "claude-sonnet",
              maxTurns: 6,
              systemPromptFile: "/tmp/system.md"
            },
            skills: {
              enabled: true,
              directories: ["/tmp/skills"]
            },
            tools: {
              availableTools: ["Read", "Write"]
            }
          })
        } as never
      });

      bot.handler?.({
        update: {
          message: {
            from: { id: 42 },
            chat: { id: 42, type: "private" },
            text: "hello"
          }
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(pairingService.isApprovedSender).toHaveBeenCalledWith("42");
      expect(sessionService.runTurn).toHaveBeenCalledTimes(1);
      expect(agentService.handleMessage).toHaveBeenCalledWith(
        {
          channel: "telegram",
          accountId: "default",
          chatType: "direct",
          conversationId: "42",
          senderId: "42",
          text: "hello"
        },
        {
          cwd: "/tmp/runtime",
          sessionId: "telegram:default:direct:42",
          model: "claude-sonnet",
          maxTurns: 6,
          systemPromptFile: "/tmp/system.md",
          skillDirectories: ["/tmp/skills"],
          tools: ["Read", "Write"]
        }
      );
      expect(sendText).toHaveBeenCalledWith(
        {
          channel: "telegram",
          accountId: "default",
          chatType: "direct",
          conversationId: "42"
        },
        "agent reply"
      );
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("keeps unauthorized telegram messages in the pairing branch", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-bootstrap-pairing-"));
    const paths = getAppPaths(home);
    const bot = new FakeTelegramBot();
    const sendText = vi.fn<() => Promise<void>>().mockResolvedValue();
    const pairingService = {
      isApprovedSender: vi.fn().mockResolvedValue(false),
      getOrCreatePendingRequest: vi.fn().mockResolvedValue({
        code: "ABCD2345",
        senderId: "42",
        createdAt: "2026-03-23T09:00:00.000Z",
        expiresAt: "2026-03-23T10:00:00.000Z"
      })
    } as never;
    const sessionService = {
      runTurn: vi.fn()
    } as never;
    const agentService = {
      handleMessage: vi.fn()
    } as never;

    try {
      await bootstrap({
        paths,
        telegramBot: bot,
        sendText,
        pairingService,
        sessionService,
        agentService,
        ipcServer: {
          start: vi.fn<() => Promise<void>>().mockResolvedValue(),
          stop: vi.fn<() => Promise<void>>().mockResolvedValue()
        } as never,
        configService: {
          load: vi.fn<() => Promise<AppConfig>>().mockResolvedValue({
            ...defaultConfig,
            telegram: {
              enabled: true,
              botToken: "secret"
            }
          })
        } as never
      });

      bot.handler?.({
        update: {
          message: {
            from: { id: 42, username: "alice" },
            chat: { id: 42, type: "private" },
            text: "hello"
          }
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(pairingService.getOrCreatePendingRequest).toHaveBeenCalledWith({
        senderId: "42",
        username: "alice"
      });
      expect(sessionService.runTurn).not.toHaveBeenCalled();
      expect(agentService.handleMessage).not.toHaveBeenCalled();
      expect(sendText).toHaveBeenCalledWith(
        {
          channel: "telegram",
          accountId: "default",
          chatType: "direct",
          conversationId: "42"
        },
        expect.stringContaining("ABCD2345")
      );
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("hot-applies updated runtime config to subsequent agent turns", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-bootstrap-reload-runtime-"));
    const paths = getAppPaths(home);
    const bot = new FakeTelegramBot();
    const sendText = vi.fn<() => Promise<void>>().mockResolvedValue();
    const pairingService = {
      isApprovedSender: vi.fn().mockResolvedValue(true),
      getOrCreatePendingRequest: vi.fn()
    } as never;
    const agentService = {
      handleMessage: vi.fn().mockResolvedValue("agent reply")
    } as never;
    const loadedConfigs: AppConfig[] = [
      {
        ...defaultConfig,
        telegram: {
          enabled: true,
          botToken: "token-1"
        },
        runtime: {
          workingDirectory: "/tmp/runtime-1",
          model: "claude-sonnet",
          maxTurns: 4,
          systemPromptFile: "/tmp/system-1.md"
        },
        skills: {
          enabled: true,
          directories: ["/tmp/skills-1"]
        },
        tools: {
          availableTools: ["Read"]
        },
        logging: {
          level: "info"
        }
      },
      {
        ...defaultConfig,
        telegram: {
          enabled: true,
          botToken: "token-1"
        },
        runtime: {
          workingDirectory: "/tmp/runtime-2",
          model: "claude-opus",
          maxTurns: 9,
          systemPromptFile: "/tmp/system-2.md"
        },
        skills: {
          enabled: true,
          directories: ["/tmp/skills-2"]
        },
        tools: {
          availableTools: ["Bash", "Write"]
        },
        logging: {
          level: "debug"
        }
      }
    ];
    const configService = {
      load: vi.fn<() => Promise<AppConfig>>().mockImplementation(async () => loadedConfigs.shift() ?? defaultConfig)
    } as never;

    try {
      const context = await bootstrap({
        paths,
        configService,
        telegramBot: bot,
        sendText,
        pairingService,
        agentService,
        ipcServer: {
          start: vi.fn<() => Promise<void>>().mockResolvedValue(),
          stop: vi.fn<() => Promise<void>>().mockResolvedValue()
        } as never
      });

      bot.handler?.({
        update: {
          message: {
            from: { id: 42 },
            chat: { id: 42, type: "private" },
            text: "before reload"
          }
        }
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      await context.reloadService.reload();

      bot.handler?.({
        update: {
          message: {
            from: { id: 42 },
            chat: { id: 42, type: "private" },
            text: "after reload"
          }
        }
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(agentService.handleMessage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ text: "before reload" }),
        {
          cwd: "/tmp/runtime-1",
          sessionId: "telegram:default:direct:42",
          model: "claude-sonnet",
          maxTurns: 4,
          systemPromptFile: "/tmp/system-1.md",
          skillDirectories: ["/tmp/skills-1"],
          tools: ["Read"]
        }
      );
      expect(agentService.handleMessage).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ text: "after reload" }),
        {
          cwd: "/tmp/runtime-2",
          sessionId: "telegram:default:direct:42",
          model: "claude-opus",
          maxTurns: 9,
          systemPromptFile: "/tmp/system-2.md",
          skillDirectories: ["/tmp/skills-2"],
          tools: ["Bash", "Write"]
        }
      );
      expect(context.logger.level).toBe("debug");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("restarts telegram polling when the bot token changes on reload", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-bootstrap-reload-telegram-"));
    const paths = getAppPaths(home);
    const telegramService = {
      start: vi.fn<() => Promise<void>>().mockResolvedValue(),
      stop: vi.fn<() => Promise<void>>().mockResolvedValue()
    } as never;
    const configService = {
      load: vi.fn<() => Promise<AppConfig>>()
        .mockResolvedValueOnce({
          ...defaultConfig,
          telegram: {
            enabled: true,
            botToken: "token-1"
          }
        })
        .mockResolvedValueOnce({
          ...defaultConfig,
          telegram: {
            enabled: true,
            botToken: "token-2"
          }
        })
    } as never;

    try {
      const context = await bootstrap({
        paths,
        configService,
        telegramService,
        ipcServer: {
          start: vi.fn<() => Promise<void>>().mockResolvedValue(),
          stop: vi.fn<() => Promise<void>>().mockResolvedValue()
        } as never
      });

      await context.reloadService.reload();

      expect(telegramService.start).toHaveBeenCalledTimes(2);
      expect(telegramService.stop).toHaveBeenCalledTimes(1);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe("shutdown", () => {
  it("runs shutdown tasks in reverse registration order and only once", async () => {
    const calls: string[] = [];
    const logger = createLogger({ subsystem: "daemon" });
    const controller = createShutdownController(logger);

    controller.add({
      name: "first",
      close: () => {
        calls.push("first");
      }
    });
    controller.add({
      name: "second",
      close: () => {
        calls.push("second");
      }
    });

    await Promise.all([controller.shutdown(), controller.shutdown("SIGTERM")]);

    expect(calls).toEqual(["second", "first"]);
  });
});

describe("runDaemon", () => {
  it("waits for a shutdown signal and exits cleanly", async () => {
    const processSource = new FakeProcess();
    const home = await mkdtemp(join(tmpdir(), "baliclaw-run-"));

    try {
      const waitForSignal = runDaemon({
        onStarted: () => {
          processSource.emit("SIGTERM");
        },
        ipcServer: {
          start: vi.fn<() => Promise<void>>().mockResolvedValue(),
          stop: vi.fn<() => Promise<void>>().mockResolvedValue()
        } as never,
        processSource,
        configService: {
          load: vi.fn<() => Promise<AppConfig>>().mockResolvedValue(defaultConfig)
        } as never,
        telegramService: {
          start: vi.fn<() => Promise<void>>().mockResolvedValue(),
          stop: vi.fn<() => Promise<void>>().mockResolvedValue()
        } as never,
        paths: getAppPaths(home)
      });

      await expect(waitForSignal).resolves.toBeUndefined();
      expect(processSource.exitCode).toBe(0);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

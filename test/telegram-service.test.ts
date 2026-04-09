import { describe, expect, it, vi } from "vitest";
import { TelegramService } from "../src/telegram/service.js";
import { createLogger } from "../src/shared/logger.js";

interface RegisteredHandler {
  (context: { update: unknown }): unknown;
}

class FakeTelegramBot {
  handler: RegisteredHandler | undefined;
  api = {
    setMyCommands: vi.fn(async () => true as const)
  };
  start = vi.fn(async (options?: { onStart?: () => unknown }) => {
    await options?.onStart?.();
  });
  stop = vi.fn(async () => undefined);

  on(_filter: "message", handler: RegisteredHandler): void {
    this.handler = handler;
  }
}

describe("TelegramService", () => {
  it("starts and stops grammy polling only once", async () => {
    const bot = new FakeTelegramBot();
    const service = new TelegramService({ bot, token: "unused" });

    await service.start();
    await service.start();
    await service.stop();
    await service.stop();

    expect(bot.api.setMyCommands).toHaveBeenCalledTimes(1);
    expect(bot.start).toHaveBeenCalledTimes(1);
    expect(bot.stop).toHaveBeenCalledTimes(1);
  });

  it("does not block startup while long polling is running", async () => {
    const bot = new FakeTelegramBot();
    let resolveStart: (() => void) | undefined;
    bot.start = vi.fn(async (options?: { onStart?: () => unknown }) => {
      await options?.onStart?.();
      await new Promise<void>((resolve) => {
        resolveStart = resolve;
      });
    });
    const service = new TelegramService({ bot, token: "unused" });

    await expect(service.start()).resolves.toBeUndefined();
    expect(bot.api.setMyCommands).toHaveBeenCalledTimes(1);
    expect(bot.start).toHaveBeenCalledTimes(1);

    resolveStart?.();
    await service.stop();
  });

  it("forwards normalized private text messages as inbound envelopes", async () => {
    const bot = new FakeTelegramBot();
    const onInbound = vi.fn();
    new TelegramService({ bot, onInbound });

    bot.handler?.({
      update: {
        message: {
          from: { id: 42, username: "alice" },
          chat: { id: 42, type: "private" },
          message_id: 99,
          text: "hello"
        }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onInbound).toHaveBeenCalledTimes(1);
    expect(onInbound).toHaveBeenCalledWith({
      message: {
        channel: "telegram",
        accountId: "default",
        chatType: "direct",
        conversationId: "42",
        senderId: "42",
        messageId: "99",
        text: "hello"
      },
      deliveryTarget: {
        channel: "telegram",
        accountId: "default",
        chatType: "direct",
        conversationId: "42"
      },
      sessionKey: "telegram:default:direct:42",
      principalKey: "42",
      username: "alice"
    });
  });

  it("ignores non-private and non-text updates", async () => {
    const bot = new FakeTelegramBot();
    const onInbound = vi.fn();
    new TelegramService({ bot, onInbound });

    bot.handler?.({
      update: {
        message: {
          from: { id: 42 },
          chat: { id: -100, type: "group" },
          text: "ignored"
        }
      }
    });
    bot.handler?.({
      update: {
        message: {
          from: { id: 42 },
          chat: { id: 42, type: "private" }
        }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onInbound).not.toHaveBeenCalled();
  });

  it("returns from the handler immediately after queueing work", async () => {
    const bot = new FakeTelegramBot();
    let resolveInbound: (() => void) | undefined;
    const onInbound = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveInbound = resolve;
        })
    );

    new TelegramService({ bot, onInbound });

    const started = performance.now();
    const result = bot.handler?.({
      update: {
        message: {
          from: { id: 7 },
          chat: { id: 7, type: "private" },
          text: "slow turn"
        }
      }
    });
    const elapsed = performance.now() - started;

    expect(result).toBeUndefined();
    expect(elapsed).toBeLessThan(50);
    expect(onInbound).toHaveBeenCalledTimes(1);

    resolveInbound?.();
  });

  it("logs inbound handler failures without throwing from the bot handler", async () => {
    const bot = new FakeTelegramBot();
    const destination = { write: vi.fn(() => true) };
    const logger = createLogger({ subsystem: "telegram", destination });
    const onInbound = vi.fn().mockRejectedValue(new Error("queue full"));

    new TelegramService({ bot, onInbound, logger });

    expect(() =>
      bot.handler?.({
        update: {
          message: {
            from: { id: 9 },
            chat: { id: 9, type: "private" },
            text: "hello"
          }
        }
      })
    ).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(destination.write).toHaveBeenCalled();
  });
});

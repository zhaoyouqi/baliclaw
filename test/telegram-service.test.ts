import { describe, expect, it, vi } from "vitest";
import { TelegramService } from "../src/telegram/service.js";
import { createLogger } from "../src/shared/logger.js";

interface RegisteredHandler {
  (context: { update: unknown }): unknown;
}

class FakeTelegramBot {
  handler: RegisteredHandler | undefined;
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
    expect(bot.start).toHaveBeenCalledTimes(1);

    resolveStart?.();
    await service.stop();
  });

  it("enqueues only private text messages", async () => {
    const bot = new FakeTelegramBot();
    const enqueueInbound = vi.fn();
    const service = new TelegramService({ bot, enqueueInbound });

    expect(service).toBeDefined();
    expect(bot.handler).toBeTypeOf("function");

    bot.handler?.({
      update: {
        message: {
          from: { id: 42 },
          chat: { id: 42, type: "private" },
          text: "hello"
        }
      }
    });

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

    expect(enqueueInbound).toHaveBeenCalledTimes(1);
    expect(enqueueInbound).toHaveBeenCalledWith({
      channel: "telegram",
      accountId: "default",
      chatType: "direct",
      conversationId: "42",
      senderId: "42",
      text: "hello"
    });
  });

  it("sends a pairing code and skips enqueue for unauthorized senders", async () => {
    const bot = new FakeTelegramBot();
    const enqueueInbound = vi.fn();
    const sendText = vi.fn();
    const pairingService = {
      isApprovedSender: vi.fn().mockResolvedValue(false),
      getOrCreatePendingRequest: vi.fn().mockResolvedValue({
        code: "ABCD2345",
        senderId: "42",
        username: "alice",
        createdAt: "2026-03-22T10:00:00.000Z",
        expiresAt: "2026-03-22T11:00:00.000Z"
      })
    };

    new TelegramService({ bot, enqueueInbound, pairingService, sendText });

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

    expect(pairingService.isApprovedSender).toHaveBeenCalledWith("42");
    expect(pairingService.getOrCreatePendingRequest).toHaveBeenCalledWith({
      senderId: "42",
      username: "alice"
    });
    expect(sendText).toHaveBeenCalledWith(
      {
        channel: "telegram",
        accountId: "default",
        chatType: "direct",
        conversationId: "42"
      },
      expect.stringContaining("ABCD2345")
    );
    expect(enqueueInbound).not.toHaveBeenCalled();
  });

  it("continues into the runtime queue for approved senders", async () => {
    const bot = new FakeTelegramBot();
    const enqueueInbound = vi.fn();
    const sendText = vi.fn();
    const pairingService = {
      isApprovedSender: vi.fn().mockResolvedValue(true),
      getOrCreatePendingRequest: vi.fn()
    };

    new TelegramService({ bot, enqueueInbound, pairingService, sendText });

    bot.handler?.({
      update: {
        message: {
          from: { id: 7 },
          chat: { id: 7, type: "private" },
          text: "allowed"
        }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(enqueueInbound).toHaveBeenCalledTimes(1);
    expect(sendText).not.toHaveBeenCalled();
    expect(pairingService.getOrCreatePendingRequest).not.toHaveBeenCalled();
  });

  it("returns from the handler immediately after queueing work", async () => {
    const bot = new FakeTelegramBot();
    let resolveEnqueue: (() => void) | undefined;
    const enqueueInbound = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveEnqueue = resolve;
        })
    );

    new TelegramService({ bot, enqueueInbound });

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
    expect(enqueueInbound).toHaveBeenCalledTimes(1);

    resolveEnqueue?.();
  });

  it("logs enqueue failures without throwing from the handler", async () => {
    const bot = new FakeTelegramBot();
    const destination = { write: vi.fn(() => true) };
    const logger = createLogger({ subsystem: "telegram", destination });
    const enqueueInbound = vi.fn().mockRejectedValue(new Error("queue full"));

    new TelegramService({ bot, enqueueInbound, logger });

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

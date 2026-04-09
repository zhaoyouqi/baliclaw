import { describe, expect, it } from "vitest";
import { normalizeTelegramUpdate } from "../src/telegram/normalize.js";

describe("normalizeTelegramUpdate", () => {
  it("normalizes a Telegram private text message into an inbound envelope", () => {
    expect(
      normalizeTelegramUpdate({
        message: {
          from: { id: 42 },
          chat: { id: 42, type: "private" },
          text: "hello from telegram"
        }
      })
    ).toEqual({
      message: {
        channel: "telegram",
        accountId: "default",
        chatType: "direct",
        conversationId: "42",
        senderId: "42",
        text: "hello from telegram"
      },
      deliveryTarget: {
        channel: "telegram",
        accountId: "default",
        chatType: "direct",
        conversationId: "42"
      },
      sessionKey: "telegram:default:direct:42",
      principalKey: "42"
    });
  });

  it("ignores non-private chats", () => {
    expect(
      normalizeTelegramUpdate({
        message: {
          from: { id: 42 },
          chat: { id: -100123, type: "group" },
          text: "hello group"
        }
      })
    ).toBeNull();
  });

  it("ignores non-text messages", () => {
    expect(
      normalizeTelegramUpdate({
        message: {
          from: { id: 42 },
          chat: { id: 42, type: "private" }
        }
      })
    ).toBeNull();
  });

  it("ignores malformed messages without sender or valid ids", () => {
    expect(
      normalizeTelegramUpdate({
        message: {
          chat: { id: 42, type: "private" },
          text: "missing sender"
        }
      })
    ).toBeNull();

    expect(
      normalizeTelegramUpdate({
        message: {
          from: { id: 42 },
          chat: { id: Number.NaN, type: "private" },
          text: "bad chat id"
        }
      })
    ).toBeNull();
  });
});

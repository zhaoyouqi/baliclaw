import { describe, expect, it, vi } from "vitest";
import {
  TelegramSendError,
  createTelegramApi,
  createTelegramTextSender,
  sendTelegramText
} from "../src/telegram/send.js";
import type { DeliveryTarget } from "../src/shared/types.js";

const directTarget: DeliveryTarget = {
  channel: "telegram",
  accountId: "default",
  chatType: "direct",
  conversationId: "123456"
};

describe("createTelegramTextSender", () => {
  it("sends a text message to the target conversation id", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });

    await sendTelegramText(directTarget, "hello from baliclaw", { sendMessage });

    expect(sendMessage).toHaveBeenCalledWith("123456", "hello from baliclaw");
  });

  it("rejects unsupported targets before calling the Telegram API", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    const sender = createTelegramTextSender({ sendMessage });

    await expect(
      sender.sendText({ ...directTarget, conversationId: "   " }, "hello")
    ).rejects.toThrowError(new TelegramSendError("Telegram conversationId must not be empty"));

    await expect(
      sender.sendText({ ...directTarget, chatType: "group" as never }, "hello")
    ).rejects.toThrowError(new TelegramSendError("Unsupported Telegram chat type: group"));

    await expect(sender.sendText(directTarget, "")).rejects.toThrowError(
      new TelegramSendError("Telegram text message must not be empty")
    );

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("returns a diagnostic error when the Telegram API fails", async () => {
    const sender = createTelegramTextSender({
      sendMessage: vi.fn().mockRejectedValue(new Error("chat not found"))
    });

    await expect(sender.sendText(directTarget, "hello")).rejects.toMatchObject({
      name: "TelegramSendError",
      message: "Failed to send Telegram DM to conversation 123456: chat not found"
    });
  });
});

describe("createTelegramApi", () => {
  it("creates a grammy Api instance", () => {
    const api = createTelegramApi("123:abc");

    expect(api).toHaveProperty("sendMessage");
  });
});

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

    expect(sendMessage).toHaveBeenCalledWith("123456", "hello from baliclaw", {
      parse_mode: "HTML"
    });
  });

  it("renders markdown as Telegram HTML", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    const sender = createTelegramTextSender({ sendMessage });

    await sender.sendText(directTarget, "# Title\n- **bold** item\n`code`");

    expect(sendMessage).toHaveBeenCalledWith(
      "123456",
      "<b>Title</b>\n• <b>bold</b> item\n<code>code</code>",
      { parse_mode: "HTML" }
    );
  });

  it("splits long text into multiple Telegram messages", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    const sender = createTelegramTextSender({ sendMessage });
    const longText = "a".repeat(4500);

    await sender.sendText(directTarget, longText);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenNthCalledWith(1, "123456", "a".repeat(4000), {
      parse_mode: "HTML"
    });
    expect(sendMessage).toHaveBeenNthCalledWith(2, "123456", "a".repeat(500), {
      parse_mode: "HTML"
    });
  });

  it("falls back to plain text when Telegram rejects HTML formatting", async () => {
    const sendMessage = vi.fn()
      .mockRejectedValueOnce(new Error("can't parse entities"))
      .mockResolvedValueOnce({ ok: true });
    const sender = createTelegramTextSender({ sendMessage });

    await sender.sendText(directTarget, "_bad markdown_");

    expect(sendMessage).toHaveBeenNthCalledWith(1, "123456", "<i>bad markdown</i>", {
      parse_mode: "HTML"
    });
    expect(sendMessage).toHaveBeenNthCalledWith(2, "123456", "_bad markdown_");
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

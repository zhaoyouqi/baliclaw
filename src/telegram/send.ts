import { Api } from "grammy";
import type { DeliveryTarget } from "../shared/types.js";
import { createTelegramClientOptions } from "./proxy.js";

const TELEGRAM_TEXT_LIMIT = 4000;

export interface TelegramTextApi {
  sendMessage(chatId: number | string, text: string): Promise<unknown>;
}

export class TelegramSendError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "TelegramSendError";
  }
}

export function createTelegramTextSender(api: TelegramTextApi) {
  return {
    async sendText(target: DeliveryTarget, text: string): Promise<void> {
      validateTarget(target);
      validateText(text);

      try {
        for (const chunk of splitTelegramPlainTextChunks(text, TELEGRAM_TEXT_LIMIT)) {
          await api.sendMessage(target.conversationId, chunk);
        }
      } catch (error) {
        throw new TelegramSendError(
          `Failed to send Telegram DM to conversation ${target.conversationId}: ${formatError(error)}`,
          error
        );
      }
    }
  };
}

export async function sendTelegramText(
  target: DeliveryTarget,
  text: string,
  api: TelegramTextApi
): Promise<void> {
  await createTelegramTextSender(api).sendText(target, text);
}

export function createTelegramApi(token: string): TelegramTextApi {
  return new Api(token, createTelegramClientOptions());
}

function validateTarget(target: DeliveryTarget): void {
  if (target.channel !== "telegram") {
    throw new TelegramSendError(`Unsupported delivery channel: ${target.channel}`);
  }

  if (target.accountId !== "default") {
    throw new TelegramSendError(`Unsupported Telegram account: ${target.accountId}`);
  }

  if (target.chatType !== "direct") {
    throw new TelegramSendError(`Unsupported Telegram chat type: ${target.chatType}`);
  }

  if (target.conversationId.trim().length === 0) {
    throw new TelegramSendError("Telegram conversationId must not be empty");
  }
}

function validateText(text: string): void {
  if (text.length === 0) {
    throw new TelegramSendError("Telegram text message must not be empty");
  }
}

function splitTelegramPlainTextChunks(text: string, limit: number): string[] {
  const normalizedLimit = Math.max(1, limit);
  const chunks: string[] = [];

  for (let start = 0; start < text.length; start += normalizedLimit) {
    chunks.push(text.slice(start, start + normalizedLimit));
  }

  return chunks;
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return String(error);
}

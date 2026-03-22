import { Api } from "grammy";
import type { DeliveryTarget } from "../shared/types.js";

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
        await api.sendMessage(target.conversationId, text);
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
  return new Api(token);
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

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return String(error);
}

import { Api } from "grammy";
import type { DeliveryTarget } from "../../shared/types.js";
import { renderTelegramHtmlText, splitTelegramHtmlChunks } from "./format.js";
import { createTelegramClientOptions } from "./proxy.js";

const TELEGRAM_TEXT_LIMIT = 4000;
const TELEGRAM_TYPING_INTERVAL_MS = 4000;

export interface TelegramTextApi {
  sendMessage(
    chatId: number | string,
    text: string,
    other?: { parse_mode?: "HTML" }
  ): Promise<unknown>;
}

export interface TelegramTypingApi {
  sendChatAction(
    chatId: number | string,
    action: "typing"
  ): Promise<unknown>;
}

export interface TelegramTypingHeartbeat {
  stop(): Promise<void>;
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
        const htmlText = renderTelegramHtmlText(text);
        const plainChunks = splitPlainTextChunks(text, TELEGRAM_TEXT_LIMIT);
        const htmlChunks = splitTelegramHtmlChunks(htmlText, TELEGRAM_TEXT_LIMIT);
        const textChunks = splitPlainTextFallback(text, htmlChunks.length, TELEGRAM_TEXT_LIMIT);

        for (let index = 0; index < htmlChunks.length; index += 1) {
          const chunk = htmlChunks[index];
          if (!chunk) {
            continue;
          }
          const plainText = textChunks[index] ?? plainChunks[index] ?? text;
          try {
            await api.sendMessage(target.conversationId, chunk, { parse_mode: "HTML" });
          } catch {
            await api.sendMessage(target.conversationId, plainText);
          }
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

export function createTelegramTypingHeartbeat(
  target: DeliveryTarget,
  api: TelegramTypingApi,
  options: {
    intervalMs?: number;
    onError?: (error: unknown) => void;
  } = {}
): TelegramTypingHeartbeat {
  validateTarget(target);

  const intervalMs = Math.max(1000, options.intervalMs ?? TELEGRAM_TYPING_INTERVAL_MS);
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastSend = Promise.resolve();

  const queueTyping = (): void => {
    lastSend = lastSend
      .catch(() => undefined)
      .then(async () => {
        if (stopped) {
          return;
        }

        try {
          await api.sendChatAction(target.conversationId, "typing");
        } catch (error) {
          options.onError?.(error);
        }
      });
  };

  queueTyping();
  timer = setInterval(queueTyping, intervalMs);
  timer.unref?.();

  return {
    async stop(): Promise<void> {
      if (stopped) {
        return;
      }

      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      await lastSend.catch(() => undefined);
    }
  };
}

export async function sendTelegramTyping(
  target: DeliveryTarget,
  api: TelegramTypingApi
): Promise<void> {
  validateTarget(target);
  await api.sendChatAction(target.conversationId, "typing");
}

export function createTelegramApi(token: string): TelegramTextApi & TelegramTypingApi {
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

function splitPlainTextChunks(text: string, limit: number): string[] {
  const normalizedLimit = Math.max(1, limit);
  const normalizedText = text.replace(/\r\n/g, "\n");
  const chunks: string[] = [];
  let remaining = normalizedText;

  while (remaining.length > normalizedLimit) {
    const candidate = remaining.slice(0, normalizedLimit);
    const splitIndex = Math.max(
      candidate.lastIndexOf("\n\n"),
      candidate.lastIndexOf("\n"),
      candidate.lastIndexOf(" ")
    );
    const cut = splitIndex > normalizedLimit / 2 ? splitIndex : normalizedLimit;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

function splitPlainTextFallback(text: string, expectedChunks: number, limit: number): string[] {
  const plainChunks = splitPlainTextChunks(text, limit);
  if (plainChunks.length >= expectedChunks) {
    return plainChunks;
  }

  const merged = [...plainChunks];
  while (merged.length < expectedChunks) {
    merged.push("");
  }
  return merged;
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return String(error);
}

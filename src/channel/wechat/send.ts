import { randomUUID } from "node:crypto";
import type { DeliveryTarget } from "../../shared/types.js";
import { renderWeChatPlainText } from "./markdown-filter.js";
import { sendMessage, sendTyping } from "./api.js";
import { MessageItemType, MessageState, MessageType, TypingStatus } from "./types.js";

const WECHAT_TYPING_INTERVAL_MS = 4_000;

export interface WeChatTypingHeartbeat {
  stop(): Promise<void>;
}

export class WeChatSendError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "WeChatSendError";
  }
}

export async function sendWeChatText(
  target: DeliveryTarget,
  text: string,
  options: {
    apiBaseUrl: string;
    token: string;
    contextToken?: string | undefined;
  },
  sendMessageImpl = sendMessage
): Promise<void> {
  validateTarget(target);

  const plainText = renderWeChatPlainText(text);
  if (plainText.length === 0) {
    throw new WeChatSendError("WeChat text message must not be empty");
  }

  try {
    await sendMessageImpl({
      baseUrl: options.apiBaseUrl,
      token: options.token,
      body: {
        msg: {
          from_user_id: "",
          to_user_id: target.conversationId,
          client_id: randomUUID(),
          message_type: MessageType.BOT,
          message_state: MessageState.FINISH,
          item_list: [{
            type: MessageItemType.TEXT,
            text_item: {
              text: plainText
            }
          }],
          context_token: options.contextToken
        }
      }
    });
  } catch (error) {
    throw new WeChatSendError(
      `Failed to send WeChat DM to conversation ${target.conversationId}: ${formatError(error)}`,
      error
    );
  }
}

export function createWeChatTypingHeartbeat(
  target: DeliveryTarget,
  options: {
    apiBaseUrl: string;
    token: string;
    typingTicket: string;
    intervalMs?: number;
    onError?: (error: unknown) => void;
  },
  sendTypingImpl = sendTyping
): WeChatTypingHeartbeat {
  validateTarget(target);

  if (options.typingTicket.trim().length === 0) {
    return {
      async stop(): Promise<void> {
        return undefined;
      }
    };
  }

  const intervalMs = Math.max(1_000, options.intervalMs ?? WECHAT_TYPING_INTERVAL_MS);
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastSend = Promise.resolve();

  const queueTyping = (status: number): void => {
    lastSend = lastSend
      .catch(() => undefined)
      .then(async () => {
        if (stopped && status !== TypingStatus.CANCEL) {
          return;
        }

        try {
          await sendTypingImpl({
            baseUrl: options.apiBaseUrl,
            token: options.token,
            body: {
              ilink_user_id: target.conversationId,
              typing_ticket: options.typingTicket,
              status
            }
          });
        } catch (error) {
          options.onError?.(error);
        }
      });
  };

  queueTyping(TypingStatus.TYPING);
  timer = setInterval(() => {
    queueTyping(TypingStatus.TYPING);
  }, intervalMs);
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

      queueTyping(TypingStatus.CANCEL);
      await lastSend.catch(() => undefined);
    }
  };
}

function validateTarget(target: DeliveryTarget): void {
  if (target.channel !== "wechat") {
    throw new WeChatSendError(`Unsupported delivery channel: ${target.channel}`);
  }

  if (target.accountId !== "default") {
    throw new WeChatSendError(`Unsupported WeChat account: ${target.accountId}`);
  }

  if (target.chatType !== "direct") {
    throw new WeChatSendError(`Unsupported WeChat chat type: ${target.chatType}`);
  }

  if (target.conversationId.trim().length === 0) {
    throw new WeChatSendError("WeChat conversationId must not be empty");
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error);
}

import type { InboundMessage } from "../shared/types.js";

export interface TelegramUser {
  id: number;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramMessage {
  message_id?: number;
  from?: TelegramUser;
  chat?: TelegramChat;
  text?: string;
}

export interface TelegramUpdate {
  message?: TelegramMessage;
}

export function normalizeTelegramUpdate(update: TelegramUpdate): InboundMessage | null {
  const message = update.message;

  if (!message) {
    return null;
  }

  if (message.chat?.type !== "private") {
    return null;
  }

  if (typeof message.text !== "string") {
    return null;
  }

  const chatId = message.chat.id;
  const senderId = message.from?.id;

  if (!Number.isInteger(chatId) || !Number.isInteger(senderId)) {
    return null;
  }

  return {
    channel: "telegram",
    accountId: "default",
    chatType: "direct",
    conversationId: String(chatId),
    senderId: String(senderId),
    text: message.text
  };
}

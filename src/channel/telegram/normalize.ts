import { buildTelegramDirectSessionId } from "../../session/stable-key.js";
import type { InboundEnvelope } from "../../shared/types.js";

export interface TelegramUser {
  id: number;
  username?: string;
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

export function normalizeTelegramUpdate(update: TelegramUpdate): InboundEnvelope | null {
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

  const inboundMessage = {
    channel: "telegram",
    accountId: "default",
    chatType: "direct" as const,
    conversationId: String(chatId),
    senderId: String(senderId),
    text: message.text,
    ...(Number.isInteger(message.message_id) ? { messageId: String(message.message_id) } : {})
  };

  return {
    message: inboundMessage,
    deliveryTarget: {
      channel: inboundMessage.channel,
      accountId: inboundMessage.accountId,
      chatType: inboundMessage.chatType,
      conversationId: inboundMessage.conversationId
    },
    sessionKey: buildTelegramDirectSessionId(inboundMessage),
    principalKey: inboundMessage.senderId,
    ...(message.from?.username ? { username: message.from.username } : {})
  };
}

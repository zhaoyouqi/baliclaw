import type { InboundMessage } from "../shared/types.js";

export interface TelegramTextUpdate {
  fromId: number;
  chatId: number;
  text: string;
}

export function normalizeTelegramUpdate(update: TelegramTextUpdate): InboundMessage {
  return {
    channel: "telegram",
    accountId: "default",
    chatType: "direct",
    conversationId: String(update.chatId),
    senderId: String(update.fromId),
    text: update.text
  };
}


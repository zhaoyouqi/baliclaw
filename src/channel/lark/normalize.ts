import { buildDefaultSessionKey } from "../../session/stable-key.js";
import type { InboundEnvelope } from "../../shared/types.js";

interface LarkMessageContent {
  text?: string;
}

export interface LarkMessageReceiveEvent {
  sender?: {
    sender_id?: {
      open_id?: string;
    };
  };
  message?: {
    chat_type?: string;
    chat_id?: string;
    content?: string;
    message_id?: string;
  };
}

export function normalizeLarkMessage(event: LarkMessageReceiveEvent): InboundEnvelope | null {
  const chatType = event.message?.chat_type?.trim();
  if (chatType !== "p2p") {
    return null;
  }

  const senderOpenId = event.sender?.sender_id?.open_id?.trim();
  const chatId = event.message?.chat_id?.trim();
  const text = extractLarkText(event.message?.content);
  if (!senderOpenId || !chatId || !text) {
    return null;
  }

  const inboundMessage = {
    channel: "lark",
    accountId: "default",
    chatType: "direct" as const,
    conversationId: chatId,
    senderId: senderOpenId,
    text,
    ...(event.message?.message_id?.trim() ? { messageId: event.message.message_id.trim() } : {})
  };

  return {
    message: inboundMessage,
    deliveryTarget: {
      channel: inboundMessage.channel,
      accountId: inboundMessage.accountId,
      chatType: inboundMessage.chatType,
      conversationId: inboundMessage.conversationId
    },
    sessionKey: buildDefaultSessionKey(inboundMessage),
    principalKey: senderOpenId
  };
}

function extractLarkText(rawContent: string | undefined): string {
  const content = rawContent?.trim();
  if (!content) {
    return "";
  }

  try {
    const parsed = JSON.parse(content) as LarkMessageContent;
    return parsed.text?.trim() ?? "";
  } catch {
    return "";
  }
}

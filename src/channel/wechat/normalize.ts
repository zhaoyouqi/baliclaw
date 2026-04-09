import { buildDefaultSessionKey } from "../../session/stable-key.js";
import type { InboundEnvelope } from "../../shared/types.js";
import { MessageItemType, type MessageItem, type WeChatMessage } from "./types.js";

export function normalizeWeChatMessage(message: WeChatMessage): InboundEnvelope | null {
  const senderId = message.from_user_id?.trim();
  if (!senderId) {
    return null;
  }

  const text = extractMessageText(message.item_list);
  if (!text) {
    return null;
  }

  const inboundMessage = {
    channel: "wechat",
    accountId: "default",
    chatType: "direct" as const,
    conversationId: senderId,
    senderId,
    text,
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
    sessionKey: buildDefaultSessionKey(inboundMessage),
    principalKey: senderId
  };
}

function extractMessageText(itemList?: MessageItem[]): string {
  if (!itemList?.length) {
    return "";
  }

  for (const item of itemList) {
    if (item.type === MessageItemType.TEXT && typeof item.text_item?.text === "string") {
      const text = item.text_item.text.trim();
      if (text.length === 0) {
        continue;
      }

      const quoted = renderQuotedContext(item.ref_msg?.title, item.ref_msg?.message_item);
      return quoted ? `${quoted}\n${text}` : text;
    }

    if (item.type === MessageItemType.VOICE && typeof item.voice_item?.text === "string") {
      const transcript = item.voice_item.text.trim();
      if (transcript.length > 0) {
        return transcript;
      }
    }
  }

  return "";
}

function renderQuotedContext(title: string | undefined, messageItem: MessageItem | undefined): string {
  if (!messageItem && !title) {
    return "";
  }

  if (messageItem && isMediaItem(messageItem)) {
    return "";
  }

  const parts: string[] = [];
  if (title?.trim()) {
    parts.push(title.trim());
  }

  if (messageItem) {
    const quotedText = extractMessageText([messageItem]).trim();
    if (quotedText.length > 0) {
      parts.push(quotedText);
    }
  }

  if (parts.length === 0) {
    return "";
  }

  return `[Quoted: ${parts.join(" | ")}]`;
}

function isMediaItem(item: MessageItem): boolean {
  return item.type === MessageItemType.IMAGE
    || item.type === MessageItemType.VIDEO
    || item.type === MessageItemType.FILE;
}

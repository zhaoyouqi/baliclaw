import type { InboundMessage } from "../shared/types.js";

export function buildDefaultSessionKey(
  message: Pick<InboundMessage, "channel" | "accountId" | "chatType" | "conversationId" | "senderId" | "threadId">
): string {
  if (message.chatType === "direct") {
    return `${message.channel}:${message.accountId}:${message.chatType}:${message.senderId}`;
  }

  const parts = [
    message.channel,
    message.accountId,
    message.chatType,
    message.conversationId
  ];

  if (message.threadId) {
    parts.push(message.threadId);
  }

  parts.push(message.senderId);
  return parts.join(":");
}

export function buildTelegramDirectSessionId(
  message: Pick<InboundMessage, "channel" | "accountId" | "chatType" | "conversationId" | "senderId" | "threadId">
): string {
  return buildDefaultSessionKey(message);
}

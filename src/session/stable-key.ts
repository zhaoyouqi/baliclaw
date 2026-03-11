import type { InboundMessage } from "../shared/types.js";

export function buildTelegramDirectSessionId(message: Pick<InboundMessage, "channel" | "accountId" | "chatType" | "senderId">): string {
  return `${message.channel}:${message.accountId}:${message.chatType}:${message.senderId}`;
}


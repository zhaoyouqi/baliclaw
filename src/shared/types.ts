export type Channel = string;
export type AccountId = string;
export type ChatType = "direct" | "group" | "channel";

export interface InboundMessage {
  channel: Channel;
  accountId: AccountId;
  chatType: ChatType;
  conversationId: string;
  senderId: string;
  text: string;
  threadId?: string;
  messageId?: string;
}

export interface DeliveryTarget {
  channel: Channel;
  accountId: AccountId;
  chatType: ChatType;
  conversationId: string;
  threadId?: string;
}

export interface InboundEnvelope {
  message: InboundMessage;
  deliveryTarget: DeliveryTarget;
  sessionKey: string;
  principalKey: string;
  username?: string;
}

export interface PairingRequest {
  channel: Channel;
  accountId: AccountId;
  code: string;
  principalKey: string;
  username?: string | undefined;
  createdAt: string;
  expiresAt: string;
}

export interface AppStatus {
  ok: true;
  service: "baliclaw";
  version: string;
}

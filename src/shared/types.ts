export type Channel = "telegram";
export type AccountId = "default";
export type ChatType = "direct";

export interface InboundMessage {
  channel: Channel;
  accountId: AccountId;
  chatType: ChatType;
  conversationId: string;
  senderId: string;
  text: string;
}

export interface DeliveryTarget {
  channel: Channel;
  accountId: AccountId;
  chatType: ChatType;
  conversationId: string;
}

export interface PairingRequest {
  code: string;
  senderId: string;
  username?: string;
  createdAt: string;
  expiresAt: string;
}

export interface AppStatus {
  ok: true;
  service: "baliclaw";
  version: string;
}

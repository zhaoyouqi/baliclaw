export type Channel = "telegram";
export type AccountId = "default";
export type ChatType = "direct" | "group" | "channel";

export interface InboundMessage {
  channel: Channel;
  accountId: AccountId;
  chatType: "direct";
  conversationId: string;
  senderId: string;
  text: string;
}

export interface DeliveryTarget {
  channel: Channel;
  accountId: AccountId;
  chatType: "direct";
  conversationId: string;
}

export interface PairingRequest {
  channel: Channel;
  accountId: AccountId;
  senderId: string;
  code: string;
  requestedAt: string;
}

export interface AppStatus {
  ok: true;
  service: "baliclaw";
  version: string;
}


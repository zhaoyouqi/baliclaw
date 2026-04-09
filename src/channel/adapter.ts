import type { DeliveryTarget, InboundEnvelope } from "../shared/types.js";

type MaybePromise<T> = T | Promise<T>;

export interface ChannelTypingHeartbeat {
  stop(): Promise<void>;
}

export interface ChannelAdapter {
  readonly channelId: string;
  readonly supportsPairing?: boolean;
  setInboundHandler(handler: (envelope: InboundEnvelope) => MaybePromise<unknown>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendText(target: DeliveryTarget, text: string): MaybePromise<unknown>;
  createTypingHeartbeat?(target: DeliveryTarget): ChannelTypingHeartbeat | Promise<ChannelTypingHeartbeat>;
}

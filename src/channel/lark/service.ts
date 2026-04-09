import * as Lark from "@larksuiteoapi/node-sdk";
import type { Logger } from "pino";
import type { ChannelAdapter } from "../adapter.js";
import { getLogger } from "../../shared/logger.js";
import type { DeliveryTarget, InboundEnvelope } from "../../shared/types.js";
import type { LarkDomain } from "./login.js";
import { normalizeLarkMessage, type LarkMessageReceiveEvent } from "./normalize.js";
import { createLarkClient, sendLarkText, toLarkSdkDomain } from "./send.js";

type MaybePromise<T> = T | Promise<T>;

export interface LarkServiceOptions {
  appId?: string;
  appSecret?: string;
  domain?: LarkDomain;
  onInbound?: (envelope: InboundEnvelope) => MaybePromise<unknown>;
  sendText?: (target: DeliveryTarget, text: string) => MaybePromise<unknown>;
  logger?: Logger;
  createClient?: typeof createLarkClient;
  createWsClient?: (input: { appId: string; appSecret: string; domain: LarkDomain }) => Lark.WSClient;
  createEventDispatcher?: () => Lark.EventDispatcher;
}

export class LarkService implements ChannelAdapter {
  readonly channelId = "lark";
  readonly supportsPairing = true;

  private readonly appId: string;
  private readonly appSecret: string;
  private readonly domain: LarkDomain;
  private readonly logger: Logger;
  private readonly createClientImpl: typeof createLarkClient;
  private readonly createWsClientImpl: NonNullable<LarkServiceOptions["createWsClient"]>;
  private readonly createEventDispatcherImpl: NonNullable<LarkServiceOptions["createEventDispatcher"]>;
  private inboundHandler: (envelope: InboundEnvelope) => MaybePromise<unknown>;
  private readonly sendTextImpl: (target: DeliveryTarget, text: string) => MaybePromise<unknown>;
  private wsClient: ReturnType<NonNullable<LarkServiceOptions["createWsClient"]>> | null = null;
  private started = false;

  constructor(options: LarkServiceOptions = {}) {
    this.appId = options.appId ?? "";
    this.appSecret = options.appSecret ?? "";
    this.domain = options.domain ?? "feishu";
    this.logger = options.logger ?? getLogger("lark");
    this.createClientImpl = options.createClient ?? createLarkClient;
    this.createWsClientImpl = options.createWsClient ?? ((input) => new Lark.WSClient({
      appId: input.appId,
      appSecret: input.appSecret,
      domain: toLarkSdkDomain(input.domain),
      loggerLevel: Lark.LoggerLevel.info
    }));
    this.createEventDispatcherImpl = options.createEventDispatcher ?? (() => new Lark.EventDispatcher({}));
    this.inboundHandler = options.onInbound ?? (() => undefined);
    this.sendTextImpl = options.sendText ?? (async (target, text) => {
      const client = this.createClientImpl({
        appId: this.appId,
        appSecret: this.appSecret,
        domain: this.domain
      });
      await sendLarkText(target, text, client);
    });
  }

  setInboundHandler(handler: (envelope: InboundEnvelope) => MaybePromise<unknown>): void {
    this.inboundHandler = handler;
  }

  async sendText(target: DeliveryTarget, text: string): Promise<void> {
    await this.sendTextImpl(target, text);
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    if (!this.appId.trim() || !this.appSecret.trim()) {
      throw new Error("Lark is not configured. Run `baliclaw channels login --channel lark --mode new` first.");
    }

    const client = this.createClientImpl({
      appId: this.appId,
      appSecret: this.appSecret,
      domain: this.domain
    });

    await (client as Lark.Client & {
      request: (input: { method: string; url: string; data?: Record<string, unknown> }) => Promise<unknown>;
    }).request({
      method: "POST",
      url: "/open-apis/bot/v1/openclaw_bot/ping",
      data: {
        needBotInfo: true
      }
    });

    const dispatcher = this.createEventDispatcherImpl();
    dispatcher.register({
      "im.message.receive_v1": async (event: unknown) => {
        const messageEvent = event as LarkMessageReceiveEvent;
        const envelope = normalizeLarkMessage(messageEvent);
        if (!envelope) {
          return;
        }

        void Promise.resolve(this.inboundHandler(envelope)).catch((error: unknown) => {
          this.logger.error(
            {
              err: error,
              senderId: envelope.message.senderId,
              conversationId: envelope.message.conversationId
            },
            "failed to handle lark message"
          );
        });
      }
    });

    this.wsClient = this.createWsClientImpl({
      appId: this.appId,
      appSecret: this.appSecret,
      domain: this.domain
    });
    this.wsClient.start({
      eventDispatcher: dispatcher
    });

    this.started = true;
    this.logger.info("lark websocket started");
  }

  async stop(): Promise<void> {
    if (!this.started && !this.wsClient) {
      return;
    }

    try {
      this.wsClient?.close({ force: true });
    } finally {
      this.wsClient = null;
      this.started = false;
    }

    this.logger.info("lark websocket stopped");
  }
}

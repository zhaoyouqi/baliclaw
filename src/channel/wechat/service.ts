import type { Logger } from "pino";
import type { ChannelAdapter } from "../adapter.js";
import { getLogger } from "../../shared/logger.js";
import type { DeliveryTarget, InboundEnvelope } from "../../shared/types.js";
import { getUpdates } from "./api.js";
import { WeChatConfigCache } from "./config-cache.js";
import { normalizeWeChatMessage } from "./normalize.js";
import { createWeChatTypingHeartbeat, sendWeChatText, type WeChatTypingHeartbeat } from "./send.js";
import { WeChatStateStore } from "./state-store.js";

type MaybePromise<T> = T | Promise<T>;

const MAX_CONSECUTIVE_FAILURES = 3;
const BACKOFF_DELAY_MS = 30_000;
const RETRY_DELAY_MS = 2_000;

export interface WeChatServiceOptions {
  apiBaseUrl?: string;
  botType?: string;
  stateStore?: WeChatStateStore;
  onInbound?: (envelope: InboundEnvelope) => MaybePromise<unknown>;
  sendText?: (target: DeliveryTarget, text: string) => MaybePromise<unknown>;
  createTypingHeartbeat?: (target: DeliveryTarget) => WeChatTypingHeartbeat | Promise<WeChatTypingHeartbeat>;
  getUpdates?: typeof getUpdates;
  logger?: Logger;
  longPollTimeoutMs?: number;
}

export class WeChatService implements ChannelAdapter {
  readonly channelId = "wechat";
  readonly supportsPairing = true;

  private readonly apiBaseUrl: string;
  private readonly stateStore: WeChatStateStore;
  private readonly logger: Logger;
  private readonly longPollTimeoutMs: number;
  private readonly getUpdatesImpl: typeof getUpdates;
  private inboundHandler: (envelope: InboundEnvelope) => MaybePromise<unknown>;
  private readonly sendTextImpl: (target: DeliveryTarget, text: string) => MaybePromise<unknown>;
  private readonly createTypingHeartbeatImpl: (target: DeliveryTarget) => WeChatTypingHeartbeat | Promise<WeChatTypingHeartbeat>;
  private pollingTask: Promise<void> | null = null;
  private pollingAbortController: AbortController | null = null;
  private configCache: WeChatConfigCache | undefined;
  private configCacheKey = "";
  private started = false;

  constructor(options: WeChatServiceOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? "https://ilinkai.weixin.qq.com";
    this.stateStore = options.stateStore ?? new WeChatStateStore();
    this.logger = options.logger ?? getLogger("wechat");
    this.longPollTimeoutMs = options.longPollTimeoutMs ?? 35_000;
    this.getUpdatesImpl = options.getUpdates ?? getUpdates;
    this.inboundHandler = options.onInbound ?? (() => undefined);
    this.sendTextImpl = options.sendText ?? (async (target, text) => {
      const auth = await this.resolveAuth();
      const contextToken = await this.stateStore.getContextToken(target.conversationId);
      await sendWeChatText(target, text, {
        apiBaseUrl: auth.apiBaseUrl,
        token: auth.token,
        contextToken
      });
    });
    this.createTypingHeartbeatImpl = options.createTypingHeartbeat ?? (async (target) => {
      const auth = await this.resolveAuth();
      const contextToken = await this.stateStore.getContextToken(target.conversationId);
      const typingTicket = await auth.configCache.getTypingTicket(target.conversationId, contextToken);
      return createWeChatTypingHeartbeat(target, {
        apiBaseUrl: auth.apiBaseUrl,
        token: auth.token,
        typingTicket,
        onError: (error) => {
          this.logger.warn(
            {
              err: error,
              conversationId: target.conversationId
            },
            "failed to send wechat typing indicator"
          );
        }
      });
    });
  }

  setInboundHandler(handler: (envelope: InboundEnvelope) => MaybePromise<unknown>): void {
    this.inboundHandler = handler;
  }

  async sendText(target: DeliveryTarget, text: string): Promise<void> {
    await this.sendTextImpl(target, text);
  }

  async createTypingHeartbeat(target: DeliveryTarget): Promise<WeChatTypingHeartbeat> {
    return await this.createTypingHeartbeatImpl(target);
  }

  async start(): Promise<void> {
    if (this.started || this.pollingTask) {
      return;
    }

    await this.resolveAuth();

    this.started = true;
    this.pollingAbortController = new AbortController();
    this.pollingTask = this.runPollingLoop(this.pollingAbortController.signal)
      .catch((error) => {
        if (this.pollingAbortController?.signal.aborted) {
          return;
        }

        this.logger.error({ err: error }, "wechat polling exited with error");
      })
      .finally(() => {
        this.started = false;
        this.pollingTask = null;
        this.pollingAbortController = null;
      });

    this.logger.info("wechat polling started");
  }

  async stop(): Promise<void> {
    if (!this.started && !this.pollingTask) {
      return;
    }

    this.pollingAbortController?.abort();
    await this.pollingTask?.catch(() => undefined);
    this.pollingTask = null;
    this.pollingAbortController = null;
    this.started = false;
    this.logger.info("wechat polling stopped");
  }

  private async runPollingLoop(signal: AbortSignal): Promise<void> {
    const auth = await this.resolveAuth();
    let nextTimeoutMs = this.longPollTimeoutMs;
    let consecutiveFailures = 0;
    let cursor = await this.stateStore.getSyncCursor();

    while (!signal.aborted) {
      try {
        const response = await this.getUpdatesImpl({
          baseUrl: auth.apiBaseUrl,
          token: auth.token,
          get_updates_buf: cursor,
          timeoutMs: nextTimeoutMs,
          signal
        });

        if (response.longpolling_timeout_ms && response.longpolling_timeout_ms > 0) {
          nextTimeoutMs = response.longpolling_timeout_ms;
        }

        if (isApiError(response)) {
          consecutiveFailures += 1;
          this.logger.warn(
            {
              ret: response.ret,
              errcode: response.errcode,
              errmsg: response.errmsg,
              consecutiveFailures
            },
            "wechat getupdates returned an error"
          );

          await sleep(consecutiveFailures >= MAX_CONSECUTIVE_FAILURES ? BACKOFF_DELAY_MS : RETRY_DELAY_MS, signal);
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            consecutiveFailures = 0;
          }
          continue;
        }

        consecutiveFailures = 0;

        if (typeof response.get_updates_buf === "string" && response.get_updates_buf !== cursor) {
          cursor = response.get_updates_buf;
          await this.stateStore.setSyncCursor(cursor);
        }

        for (const message of response.msgs ?? []) {
          const senderId = message.from_user_id?.trim();
          const contextToken = message.context_token?.trim();

          if (senderId && contextToken) {
            await this.stateStore.setContextToken(senderId, contextToken);
          }

          const envelope = normalizeWeChatMessage(message);
          if (!envelope) {
            continue;
          }

          void Promise.resolve(this.inboundHandler(envelope)).catch((error: unknown) => {
            this.logger.error(
              {
                err: error,
                senderId: envelope.message.senderId,
                conversationId: envelope.message.conversationId
              },
              "failed to handle wechat message"
            );
          });
        }
      } catch (error) {
        if (signal.aborted) {
          return;
        }

        consecutiveFailures += 1;
        this.logger.error({ err: error, consecutiveFailures }, "wechat getupdates failed");
        await sleep(consecutiveFailures >= MAX_CONSECUTIVE_FAILURES ? BACKOFF_DELAY_MS : RETRY_DELAY_MS, signal);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          consecutiveFailures = 0;
        }
      }
    }
  }

  private async resolveAuth(): Promise<{
    apiBaseUrl: string;
    token: string;
    configCache: WeChatConfigCache;
  }> {
    const state = await this.stateStore.load();
    const token = state.token?.trim();

    if (!token) {
      throw new Error("WeChat is not configured. Run `baliclaw channels login --channel wechat` first.");
    }

    const apiBaseUrl = state.apiBaseUrl?.trim() || this.apiBaseUrl;
    const cacheKey = `${apiBaseUrl}\u0000${token}`;
    if (!this.configCache || this.configCacheKey !== cacheKey) {
      this.configCache = new WeChatConfigCache({
        baseUrl: apiBaseUrl,
        token
      });
      this.configCacheKey = cacheKey;
    }

    return {
      apiBaseUrl,
      token,
      configCache: this.configCache
    };
  }
}

function isApiError(response: Awaited<ReturnType<typeof getUpdates>>): boolean {
  return (response.ret !== undefined && response.ret !== 0)
    || (response.errcode !== undefined && response.errcode !== 0);
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();

    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    }, { once: true });
  });
}

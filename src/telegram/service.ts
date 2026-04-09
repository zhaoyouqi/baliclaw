import { Bot, GrammyError, HttpError, type PollingOptions } from "grammy";
import type { Logger } from "pino";
import type { ChannelAdapter } from "../channel/adapter.js";
import { getLogger } from "../shared/logger.js";
import type { DeliveryTarget, InboundEnvelope } from "../shared/types.js";
import {
  createTelegramApi,
  createTelegramTypingHeartbeat,
  sendTelegramText,
  type TelegramTypingHeartbeat
} from "./send.js";
import { createTelegramClientOptions } from "./proxy.js";
import {
  normalizeTelegramUpdate,
  type TelegramUpdate
} from "./normalize.js";

type MaybePromise<T> = T | Promise<T>;

export interface TelegramServiceContext {
  update: TelegramUpdate;
}

export interface TelegramPollingBot {
  api: {
    setMyCommands(
      commands: readonly TelegramBotCommand[],
      other?: TelegramSetMyCommandsOptions
    ): Promise<true>;
  };
  on(filter: "message", handler: (context: TelegramServiceContext) => MaybePromise<unknown>): void;
  start(options?: PollingOptions): Promise<void>;
  stop(): Promise<void>;
}

interface TelegramBotCommand {
  command: string;
  description: string;
}

interface TelegramSetMyCommandsOptions {
  scope?: {
    type: "all_private_chats";
  };
}

export interface TelegramServiceOptions {
  token?: string;
  bot?: TelegramPollingBot;
  onInbound?: (envelope: InboundEnvelope) => MaybePromise<unknown>;
  sendText?: (target: DeliveryTarget, text: string) => MaybePromise<unknown>;
  createTypingHeartbeat?: (target: DeliveryTarget) => TelegramTypingHeartbeat | Promise<TelegramTypingHeartbeat>;
  logger?: Logger;
}

export class TelegramService implements ChannelAdapter {
  readonly channelId = "telegram";
  readonly supportsPairing = true;

  private bot: TelegramPollingBot | undefined;
  private readonly token: string;
  private inboundHandler: (envelope: InboundEnvelope) => MaybePromise<unknown>;
  private readonly sendTextImpl: (target: DeliveryTarget, text: string) => MaybePromise<unknown>;
  private readonly createTypingHeartbeatImpl: (target: DeliveryTarget) => TelegramTypingHeartbeat | Promise<TelegramTypingHeartbeat>;
  private readonly logger: Logger;
  private pollingTask: Promise<void> | null = null;
  private started = false;

  constructor(options: TelegramServiceOptions = {}) {
    this.bot = options.bot;
    this.token = options.token ?? "";
    this.inboundHandler = options.onInbound ?? (() => undefined);
    this.logger = options.logger ?? getLogger("telegram");
    this.sendTextImpl = options.sendText ?? (async (target, text) => {
      await sendTelegramText(target, text, createTelegramApi(this.token));
    });
    this.createTypingHeartbeatImpl = options.createTypingHeartbeat ?? ((target) =>
      createTelegramTypingHeartbeat(target, createTelegramApi(this.token), {
        onError: (error) => {
          this.logger.warn(
            {
              err: error,
              conversationId: target.conversationId
            },
            "failed to send telegram typing action"
          );
        }
      }));

    if (this.bot) {
      this.registerMessageHandler(this.bot);
    }
  }

  setInboundHandler(handler: (envelope: InboundEnvelope) => MaybePromise<unknown>): void {
    this.inboundHandler = handler;
  }

  async sendText(target: DeliveryTarget, text: string): Promise<void> {
    await this.sendTextImpl(target, text);
  }

  async createTypingHeartbeat(target: DeliveryTarget): Promise<TelegramTypingHeartbeat> {
    return await this.createTypingHeartbeatImpl(target);
  }

  private registerMessageHandler(bot: TelegramPollingBot): void {
    bot.on("message", (context) => {
      const envelope = normalizeTelegramUpdate(context.update);

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
          "failed to handle telegram message"
        );
      });
    });
  }

  async start(): Promise<void> {
    if (this.started || this.pollingTask) {
      return;
    }

    try {
      const bot = this.bot ?? createTelegramBot(this.token);

      if (!this.bot) {
        this.bot = bot;
        this.registerMessageHandler(bot);
      }

      await bot.api.setMyCommands(
        [
          {
            command: "compact",
            description: "Compact the current session"
          },
          {
            command: "new",
            description: "Start a fresh session"
          },
          {
            command: "todo",
            description: "Show the current task list"
          }
        ],
        {
          scope: {
            type: "all_private_chats"
          }
        }
      );

      this.pollingTask = bot.start({
        onStart: async () => {
          this.started = true;
          this.logger.info("telegram polling started");
        }
      });

      void this.pollingTask.catch((error) => {
        this.pollingTask = null;
        this.started = false;
        this.logger.error({ err: error }, "telegram polling exited with error");
      });
    } catch (error) {
      this.pollingTask = null;
      this.started = false;
      this.logger.error({ err: error }, "failed to start telegram polling");
      throw toTelegramServiceError(error);
    }
  }

  async stop(): Promise<void> {
    if (!this.started && !this.pollingTask) {
      return;
    }

    await this.bot?.stop();
    this.pollingTask = null;
    this.started = false;
    this.logger.info("telegram polling stopped");
  }
}

export function createTelegramBot(token: string): TelegramPollingBot {
  return new Bot(token, {
    client: createTelegramClientOptions()
  });
}

function toTelegramServiceError(error: unknown): Error {
  if (error instanceof GrammyError) {
    return new Error(`Telegram API error ${error.error_code}: ${error.description}`, {
      cause: error
    });
  }

  if (error instanceof HttpError) {
    return new Error(`Telegram network error: ${error.message}`, {
      cause: error
    });
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(`Unknown Telegram error: ${String(error)}`);
}

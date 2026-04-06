import { Bot, GrammyError, HttpError, type PollingOptions } from "grammy";
import type { Logger } from "pino";
import type { PairingService } from "../auth/pairing-service.js";
import { getLogger } from "../shared/logger.js";
import type { DeliveryTarget, InboundMessage } from "../shared/types.js";
import { createTelegramClientOptions } from "./proxy.js";
import {
  normalizeTelegramUpdate,
  type TelegramUpdate
} from "./normalize.js";

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
  enqueueInbound?: (message: InboundMessage) => MaybePromise<unknown>;
  pairingService?: Pick<PairingService, "getOrCreatePendingRequest" | "isApprovedSender">;
  resetSession?: (message: InboundMessage) => MaybePromise<unknown>;
  sendText?: (target: DeliveryTarget, text: string) => MaybePromise<unknown>;
  logger?: Logger;
}

type MaybePromise<T> = T | Promise<T>;

export class TelegramService {
  private bot: TelegramPollingBot | undefined;
  private readonly token: string;
  private readonly enqueueInbound: (message: InboundMessage) => MaybePromise<unknown>;
  private readonly pairingService: Pick<PairingService, "getOrCreatePendingRequest" | "isApprovedSender"> | undefined;
  private readonly resetSession: ((message: InboundMessage) => MaybePromise<unknown>) | undefined;
  private readonly sendText: (target: DeliveryTarget, text: string) => MaybePromise<unknown>;
  private readonly logger: Logger;
  private pollingTask: Promise<void> | null = null;
  private started = false;

  constructor(options: TelegramServiceOptions = {}) {
    this.bot = options.bot;
    this.token = options.token ?? "";
    this.enqueueInbound = options.enqueueInbound ?? (() => undefined);
    this.pairingService = options.pairingService;
    this.resetSession = options.resetSession;
    this.sendText = options.sendText ?? (() => undefined);
    this.logger = options.logger ?? getLogger("telegram");

    if (this.bot) {
      this.registerMessageHandler(this.bot);
    }
  }

  private registerMessageHandler(bot: TelegramPollingBot): void {
    bot.on("message", (context) => {
      const inbound = normalizeTelegramUpdate(context.update);

      if (!inbound) {
        return;
      }

      void this.handleInboundMessage(inbound, context.update).catch((error: unknown) => {
        this.logger.error(
          {
            err: error,
            senderId: inbound.senderId,
            conversationId: inbound.conversationId
          },
          "failed to enqueue telegram message"
        );
      });
    });
  }

  private async handleInboundMessage(inbound: InboundMessage, update: TelegramUpdate): Promise<void> {
    if (this.pairingService && !await this.pairingService.isApprovedSender(inbound.senderId)) {
      const pairingInput: { senderId: string; username?: string } = {
        senderId: inbound.senderId
      };

      if (update.message?.from?.username) {
        pairingInput.username = update.message.from.username;
      }

      const request = await this.pairingService.getOrCreatePendingRequest({
        ...pairingInput
      });

      await this.sendText(
        {
          channel: "telegram",
          accountId: "default",
          chatType: "direct",
          conversationId: inbound.conversationId
        },
        `Your BaliClaw pairing code is ${request.code}. Ask an operator to approve it before sending more messages.`
      );
      return;
    }

    if (this.resetSession && isNewSessionCommand(inbound.text)) {
      await this.resetSession(inbound);
      await this.sendText(
        {
          channel: "telegram",
          accountId: "default",
          chatType: "direct",
          conversationId: inbound.conversationId
        },
        "Started a fresh session. Your next message will use a new Claude session."
      );
      return;
    }

    await this.enqueueInbound(inbound);
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
            command: "new",
            description: "Start a fresh session"
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

function isNewSessionCommand(text: string): boolean {
  const normalized = text.trim();
  return /^\/new(?:@[A-Za-z0-9_]+)?$/.test(normalized);
}

import type { Logger } from "pino";
import type { PairingService } from "../auth/pairing-service.js";
import type { ScheduledAgentRunOptions } from "../runtime/agent-service.js";
import { AgentService } from "../runtime/agent-service.js";
import { SessionService } from "../session/service.js";
import type { DeliveryTarget, InboundEnvelope } from "../shared/types.js";
import { getLogger } from "../shared/logger.js";
import type { ChannelAdapter, ChannelTypingHeartbeat } from "./adapter.js";

export interface InboundRouterOptions {
  pairingService?: Pick<PairingService, "getOrCreatePendingRequest" | "isApprovedPrincipal">;
  sessionService?: SessionService;
  agentService?: AgentService;
  logger?: Logger;
  getAdapter: (channelId: string) => ChannelAdapter | undefined;
  buildAgentRunOptions: (sessionKey: string) => ScheduledAgentRunOptions;
}

const noopTypingHeartbeat: ChannelTypingHeartbeat = {
  async stop(): Promise<void> {
    return undefined;
  }
};

export class InboundRouter {
  private readonly pairingService: Pick<PairingService, "getOrCreatePendingRequest" | "isApprovedPrincipal"> | undefined;
  private readonly sessionService: SessionService;
  private readonly agentService: AgentService;
  private readonly logger: Logger;
  private readonly getAdapter: (channelId: string) => ChannelAdapter | undefined;
  private readonly buildAgentRunOptions: (sessionKey: string) => ScheduledAgentRunOptions;

  constructor(options: InboundRouterOptions) {
    this.pairingService = options.pairingService;
    this.sessionService = options.sessionService ?? new SessionService();
    this.agentService = options.agentService ?? new AgentService();
    this.logger = options.logger ?? getLogger("session");
    this.getAdapter = options.getAdapter;
    this.buildAgentRunOptions = options.buildAgentRunOptions;
  }

  async handleInbound(envelope: InboundEnvelope): Promise<void> {
    const adapter = this.requireAdapter(envelope.message.channel);

    if (adapter.supportsPairing && this.pairingService) {
      const approved = await isApprovedPrincipal(this.pairingService, envelope);

      if (!approved) {
        const request = await getOrCreatePendingRequest(this.pairingService, envelope);
        await this.sendText(
          envelope.deliveryTarget,
          `Your BaliClaw pairing code is ${request.code}. Ask an operator to approve it before sending more messages.`
        );
        return;
      }
    }

    if (isNewSessionCommand(envelope.message.text)) {
      await this.sessionService.runTurn(toSessionTurnInput(envelope), async (_message, sessionKey) => {
        await this.agentService.resetSession(sessionKey);
        return undefined;
      });
      await this.sendText(
        envelope.deliveryTarget,
        "Started a fresh session. Your next message will use a new Claude session."
      );
      return;
    }

    if (isCompactSessionCommand(envelope.message.text)) {
      const reply = await this.sessionService.runTurn(toSessionTurnInput(envelope), async (message, sessionKey) => {
        const typingHeartbeat = await this.createTypingHeartbeat(envelope.deliveryTarget);

        try {
          return await this.agentService.compactSession(message, this.buildAgentRunOptions(sessionKey), sessionKey);
        } finally {
          await typingHeartbeat.stop();
        }
      });
      await this.sendText(
        envelope.deliveryTarget,
        reply ?? "Compacted the current session."
      );
      return;
    }

    if (isTodoSessionCommand(envelope.message.text)) {
      const reply = await this.sessionService.runTurn(toSessionTurnInput(envelope), async (_message, sessionKey) =>
        this.agentService.getTodoSummary(sessionKey)
      );
      await this.sendText(
        envelope.deliveryTarget,
        reply || "No task list is available for the current session yet."
      );
      return;
    }

    try {
      await this.sessionService.runTurn(toSessionTurnInput(envelope), async (message, sessionKey) => {
        const typingHeartbeat = await this.createTypingHeartbeat(envelope.deliveryTarget);
        let result;

        try {
          result = await this.agentService.handleMessageWithMetadata(
            message,
            this.buildAgentRunOptions(sessionKey),
            sessionKey
          );
        } finally {
          await typingHeartbeat.stop();
        }

        if (result.autoCompacted) {
          const notice = typeof result.autoCompactionPreTokens === "number"
            ? `Session context was automatically compacted at about ${result.autoCompactionPreTokens} tokens so the conversation could continue.`
            : "Session context was automatically compacted so the conversation could continue.";
          await this.sendText(envelope.deliveryTarget, notice);
        }
        if (result.todoNotice) {
          await this.sendText(envelope.deliveryTarget, result.todoNotice);
        }
        if (result.text.trim().length > 0) {
          await this.sendText(envelope.deliveryTarget, result.text);
        }

        return undefined;
      });
    } catch (error) {
      this.logger.error(
        {
          err: error,
          channel: envelope.message.channel,
          sessionKey: envelope.sessionKey
        },
        "failed to route inbound message"
      );
      throw error;
    }
  }

  private requireAdapter(channelId: string): ChannelAdapter {
    const adapter = this.getAdapter(channelId);

    if (!adapter) {
      throw new Error(`No channel adapter is registered for ${channelId}`);
    }

    return adapter;
  }

  private async sendText(target: DeliveryTarget, text: string): Promise<void> {
    await this.requireAdapter(target.channel).sendText(target, text);
  }

  private async createTypingHeartbeat(target: DeliveryTarget): Promise<ChannelTypingHeartbeat> {
    const adapter = this.requireAdapter(target.channel);

    if (!adapter.createTypingHeartbeat) {
      return noopTypingHeartbeat;
    }

    return await adapter.createTypingHeartbeat(target);
  }
}

function isNewSessionCommand(text: string): boolean {
  return /^\/new(?:@[A-Za-z0-9_]+)?$/.test(text.trim());
}

function isCompactSessionCommand(text: string): boolean {
  return /^\/compact(?:@[A-Za-z0-9_]+)?$/.test(text.trim());
}

function isTodoSessionCommand(text: string): boolean {
  return /^\/todo(?:@[A-Za-z0-9_]+)?$/.test(text.trim());
}

function toSessionTurnInput(envelope: InboundEnvelope) {
  return {
    ...envelope.message,
    deliveryTarget: envelope.deliveryTarget,
    sessionKey: envelope.sessionKey,
    principalKey: envelope.principalKey,
    ...(envelope.username ? { username: envelope.username } : {})
  };
}

async function isApprovedPrincipal(
  pairingService: Pick<PairingService, "getOrCreatePendingRequest" | "isApprovedPrincipal">,
  envelope: InboundEnvelope
): Promise<boolean> {
  const compatibilityService = pairingService as Pick<PairingService, "isApprovedPrincipal"> & {
    isApprovedSender?: (principalKey: string) => Promise<boolean>;
  };

  if (typeof compatibilityService.isApprovedPrincipal === "function") {
    return compatibilityService.isApprovedPrincipal({
      channel: envelope.message.channel,
      accountId: envelope.message.accountId,
      principalKey: envelope.principalKey
    });
  }

  return await compatibilityService.isApprovedSender?.(envelope.principalKey) ?? false;
}

async function getOrCreatePendingRequest(
  pairingService: Pick<PairingService, "getOrCreatePendingRequest" | "isApprovedPrincipal">,
  envelope: InboundEnvelope
) {
  const compatibilityService = pairingService as Pick<PairingService, "getOrCreatePendingRequest"> & {
    getOrCreatePendingRequest?: (input: {
      channel?: string;
      accountId?: string;
      principalKey?: string;
      senderId?: string;
      username?: string;
    }) => Promise<{ code: string }>;
  };

  return await compatibilityService.getOrCreatePendingRequest?.({
    channel: envelope.message.channel,
    accountId: envelope.message.accountId,
    principalKey: envelope.principalKey,
    senderId: envelope.principalKey,
    ...(envelope.username ? { username: envelope.username } : {})
  }) ?? { code: "" };
}

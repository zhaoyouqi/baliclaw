import type { DeliveryTarget, InboundEnvelope, InboundMessage } from "../shared/types.js";
import { buildDefaultSessionKey } from "./stable-key.js";
import { TurnQueue } from "./turn-queue.js";

export type SessionTurnHandler<T> = (
  message: InboundMessage,
  sessionId: string,
  envelope: InboundEnvelope
) => Promise<T>;

type SessionTurnInput = InboundEnvelope | (InboundMessage & {
  sessionKey?: string;
  deliveryTarget?: DeliveryTarget;
  principalKey?: string;
  username?: string;
});

export class SessionService {
  constructor(private readonly turnQueue = new TurnQueue()) {}

  buildSessionId(input: SessionTurnInput): string {
    if (isInboundEnvelope(input)) {
      return input.sessionKey;
    }

    if (typeof input.sessionKey === "string") {
      return input.sessionKey;
    }

    return buildDefaultSessionKey(input);
  }

  async runTurn<T>(input: SessionTurnInput, handler: SessionTurnHandler<T>): Promise<T> {
    const envelope = normalizeEnvelope(input, this.buildSessionId(input));
    const sessionId = envelope.sessionKey;
    return this.turnQueue.enqueue(sessionId, async () => handler(envelope.message, sessionId, envelope));
  }
}

function normalizeEnvelope(input: SessionTurnInput, sessionKey: string): InboundEnvelope {
  if (isInboundEnvelope(input)) {
    return input;
  }

  return {
    message: {
      channel: input.channel,
      accountId: input.accountId,
      chatType: input.chatType,
      conversationId: input.conversationId,
      senderId: input.senderId,
      text: input.text,
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.messageId ? { messageId: input.messageId } : {})
    },
    deliveryTarget: input.deliveryTarget ?? {
      channel: input.channel,
      accountId: input.accountId,
      chatType: input.chatType,
      conversationId: input.conversationId,
      ...(input.threadId ? { threadId: input.threadId } : {})
    },
    sessionKey,
    principalKey: input.principalKey ?? input.senderId,
    ...(input.username ? { username: input.username } : {})
  };
}

function isInboundEnvelope(input: SessionTurnInput): input is InboundEnvelope {
  return "message" in input && typeof input.message === "object" && input.message !== null;
}

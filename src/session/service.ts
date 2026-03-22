import type { InboundMessage } from "../shared/types.js";
import { buildTelegramDirectSessionId } from "./stable-key.js";
import { TurnQueue } from "./turn-queue.js";

export type SessionTurnHandler<T> = (message: InboundMessage, sessionId: string) => Promise<T>;

export class SessionService {
  constructor(private readonly turnQueue = new TurnQueue()) {}

  buildSessionId(message: InboundMessage): string {
    return buildTelegramDirectSessionId(message);
  }

  async runTurn<T>(message: InboundMessage, handler: SessionTurnHandler<T>): Promise<T> {
    const sessionId = this.buildSessionId(message);
    return this.turnQueue.enqueue(sessionId, async () => handler(message, sessionId));
  }
}

import { KeyedQueue } from "../shared/keyed-queue.js";

export class TurnQueue {
  private readonly queue = new KeyedQueue();

  enqueue(sessionId: string, task: () => Promise<void>): Promise<void> {
    return this.queue.enqueue(sessionId, task);
  }
}


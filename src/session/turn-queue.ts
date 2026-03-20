import { KeyedQueue } from "../shared/keyed-queue.js";

export class TurnQueue {
  private readonly queue = new KeyedQueue();

  enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    return this.queue.enqueue(sessionId, task);
  }
}

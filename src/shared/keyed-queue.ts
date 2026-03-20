export class KeyedQueue {
  private readonly tails = new Map<string, Promise<void>>();

  enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    const tail = next.then(
      () => undefined,
      () => undefined
    ).finally(() => {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    });
    this.tails.set(key, tail);
    return next;
  }
}

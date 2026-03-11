export class KeyedQueue {
  private readonly tails = new Map<string, Promise<void>>();

  enqueue(key: string, task: () => Promise<void>): Promise<void> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.tails.set(
      key,
      next.finally(() => {
        if (this.tails.get(key) === next) {
          this.tails.delete(key);
        }
      })
    );
    return next;
  }
}


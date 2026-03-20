import { describe, expect, it } from "vitest";
import { KeyedQueue } from "../src/shared/keyed-queue.js";
import { TurnQueue } from "../src/session/turn-queue.js";

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe("KeyedQueue", () => {
  it("runs tasks with the same key strictly in sequence", async () => {
    const queue = new KeyedQueue();
    const order: string[] = [];
    const firstGate = createDeferred();

    const first = queue.enqueue("session-1", async () => {
      order.push("first:start");
      await firstGate.promise;
      order.push("first:end");
      return "first";
    });

    const second = queue.enqueue("session-1", async () => {
      order.push("second:start");
      order.push("second:end");
      return "second";
    });

    await Promise.resolve();
    expect(order).toEqual(["first:start"]);

    firstGate.resolve();

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("allows tasks with different keys to run in parallel", async () => {
    const queue = new KeyedQueue();
    const order: string[] = [];
    const gate = createDeferred();

    const first = queue.enqueue("session-1", async () => {
      order.push("one:start");
      await gate.promise;
      order.push("one:end");
    });

    const second = queue.enqueue("session-2", async () => {
      order.push("two:start");
      order.push("two:end");
    });

    await second;
    expect(order).toEqual(["one:start", "two:start", "two:end"]);

    gate.resolve();
    await first;
    expect(order).toEqual(["one:start", "two:start", "two:end", "one:end"]);
  });

  it("continues processing later tasks after a failure", async () => {
    const queue = new KeyedQueue();
    const order: string[] = [];

    const first = queue.enqueue("session-1", async () => {
      order.push("first");
      throw new Error("boom");
    });

    const second = queue.enqueue("session-1", async () => {
      order.push("second");
      return "ok";
    });

    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toBe("ok");
    expect(order).toEqual(["first", "second"]);
  });
});

describe("TurnQueue", () => {
  it("serializes work by session id", async () => {
    const queue = new TurnQueue();
    const events: string[] = [];
    const gate = createDeferred();

    const first = queue.enqueue("telegram:default:direct:42", async () => {
      events.push("turn-1:start");
      await gate.promise;
      events.push("turn-1:end");
    });

    const second = queue.enqueue("telegram:default:direct:42", async () => {
      events.push("turn-2:start");
      events.push("turn-2:end");
    });

    await Promise.resolve();
    expect(events).toEqual(["turn-1:start"]);

    gate.resolve();

    await first;
    await second;
    expect(events).toEqual(["turn-1:start", "turn-1:end", "turn-2:start", "turn-2:end"]);
  });
});

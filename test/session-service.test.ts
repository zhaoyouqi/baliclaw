import { describe, expect, it } from "vitest";
import { SessionService } from "../src/session/service.js";
import type { InboundMessage } from "../src/shared/types.js";

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

function makeMessage(senderId: string, text: string): InboundMessage {
  return {
    channel: "telegram",
    accountId: "default",
    chatType: "direct",
    conversationId: senderId,
    senderId,
    text
  };
}

describe("SessionService", () => {
  it("always builds the same session id for the same sender", () => {
    const service = new SessionService();
    const first = service.buildSessionId(makeMessage("42", "hello"));
    const second = service.buildSessionId(makeMessage("42", "world"));

    expect(first).toBe("telegram:default:direct:42");
    expect(second).toBe(first);
  });

  it("serializes turns for the same session id", async () => {
    const service = new SessionService();
    const order: string[] = [];
    const firstGate = createDeferred();

    const first = service.runTurn(makeMessage("42", "first"), async (_message, sessionId) => {
      order.push(`${sessionId}:start-1`);
      await firstGate.promise;
      order.push(`${sessionId}:end-1`);
      return "first";
    });

    const second = service.runTurn(makeMessage("42", "second"), async (_message, sessionId) => {
      order.push(`${sessionId}:start-2`);
      order.push(`${sessionId}:end-2`);
      return "second";
    });

    await Promise.resolve();
    expect(order).toEqual(["telegram:default:direct:42:start-1"]);

    firstGate.resolve();

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(order).toEqual([
      "telegram:default:direct:42:start-1",
      "telegram:default:direct:42:end-1",
      "telegram:default:direct:42:start-2",
      "telegram:default:direct:42:end-2"
    ]);
  });

  it("allows different session ids to run in parallel", async () => {
    const service = new SessionService();
    const order: string[] = [];
    const gate = createDeferred();

    const first = service.runTurn(makeMessage("42", "slow"), async () => {
      order.push("42:start");
      await gate.promise;
      order.push("42:end");
    });

    const second = service.runTurn(makeMessage("99", "fast"), async () => {
      order.push("99:start");
      order.push("99:end");
    });

    await second;
    expect(order).toEqual(["42:start", "99:start", "99:end"]);

    gate.resolve();
    await first;
    expect(order).toEqual(["42:start", "99:start", "99:end", "42:end"]);
  });

  it("does not change process.cwd while handling turns", async () => {
    const service = new SessionService();
    const before = process.cwd();

    await service.runTurn(makeMessage("42", "cwd"), async (_message, sessionId) => {
      expect(sessionId).toBe("telegram:default:direct:42");
      expect(process.cwd()).toBe(before);
      return "ok";
    });

    expect(process.cwd()).toBe(before);
  });
});

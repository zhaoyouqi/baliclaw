import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { ScheduledTaskFileConfig } from "../src/config/scheduled-task-config.js";
import { ScheduledTaskService } from "../src/daemon/scheduled-task-service.js";

class FakeWatcher extends EventEmitter {
  close = vi.fn();
}

describe("ScheduledTaskService", () => {
  it("loads tasks on start and schedules future runs", async () => {
    const watcher = new FakeWatcher();
    const setTimeoutFn = vi.fn((_handler: () => void, _delay: number) => 1 as never);
    const now = new Date(2026, 3, 8, 8, 0, 0, 0);
    const service = new ScheduledTaskService({
      configService: {
        getPath: () => "/tmp/scheduled-tasks.json5",
        load: vi.fn(async (): Promise<ScheduledTaskFileConfig> => ({
          tasks: {
            dailySummary: {
              schedule: {
                kind: "daily",
                time: "09:00"
              },
              prompt: "Summarize",
              delivery: {
                channel: "telegram",
                accountId: "default",
                chatType: "direct",
                conversationId: "42"
              },
              timeoutMinutes: 30
            }
          }
        }))
      } as never,
      watchConfigDirectory: vi.fn(() => watcher) as never,
      setTimeoutFn,
      now: () => now
    });

    await service.start();

    expect(setTimeoutFn).toHaveBeenCalledTimes(1);
    expect(setTimeoutFn.mock.calls[0]?.[1]).toBe(60 * 60 * 1000);
    await service.stop();
  });

  it("marks runs as skipped when a previous run is still active", async () => {
    const watcher = new FakeWatcher();
    const handlers: Array<() => void> = [];
    const setTimeoutFn = vi.fn((handler: () => void, _delay: number) => {
      handlers.push(handler);
      return handlers.length as never;
    });
    const statusStore = {
      set: vi.fn(async () => undefined)
    } as never;
    let currentTime = new Date(2026, 3, 8, 8, 0, 0, 0);
    const service = new ScheduledTaskService({
      configService: {
        getPath: () => "/tmp/scheduled-tasks.json5",
        load: vi.fn(async (): Promise<ScheduledTaskFileConfig> => ({
          tasks: {
            dailySummary: {
              schedule: {
                kind: "everyHours",
                intervalHours: 1
              },
              prompt: "Summarize",
              delivery: {
                channel: "telegram",
                accountId: "default",
                chatType: "direct",
                conversationId: "42"
              },
              timeoutMinutes: 30
            }
          }
        }))
      } as never,
      statusStore,
      watchConfigDirectory: vi.fn(() => watcher) as never,
      setTimeoutFn,
      clearTimeoutFn: vi.fn(),
      onTrigger: vi.fn(async () => {
        currentTime = new Date(2026, 3, 8, 9, 0, 0, 0);
        await new Promise(() => undefined);
      }),
      onSkip: vi.fn(async () => undefined),
      now: () => currentTime
    });

    await service.start();
    handlers[0]?.();
    handlers[0]?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(statusStore.set).toHaveBeenCalledWith(
      "dailySummary",
      expect.objectContaining({
        status: "skipped",
        reason: "previous run still active"
      })
    );

    await service.stop();
  });
});

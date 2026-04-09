import { describe, expect, it, vi } from "vitest";
import { ScheduledTaskManager } from "../src/daemon/scheduled-task-manager.js";

const task = {
  schedule: {
    kind: "daily" as const,
    time: "09:00"
  },
  prompt: "Summarize",
  delivery: {
    channel: "telegram",
    accountId: "default",
    chatType: "direct" as const,
    conversationId: "42"
  },
  timeoutMinutes: 30
};

describe("ScheduledTaskManager", () => {
  it("creates, updates, lists, and deletes tasks through the task file service", async () => {
    const config = { tasks: {} as Record<string, typeof task> };
    const configService = {
      load: vi.fn(async () => structuredClone(config)),
      save: vi.fn(async (next) => {
        config.tasks = next.tasks;
      })
    };
    const statusStore = {
      get: vi.fn(async () => undefined),
      load: vi.fn(async () => ({ tasks: {} })),
      delete: vi.fn(async () => undefined)
    };
    const manager = new ScheduledTaskManager(configService as never, statusStore as never);

    await expect(manager.createTask("dailySummary", task)).resolves.toEqual(task);
    await expect(manager.listTasks()).resolves.toEqual({
      dailySummary: task
    });

    const updatedTask = {
      ...task,
      timeoutMinutes: 45
    };

    await expect(manager.updateTask("dailySummary", updatedTask)).resolves.toEqual(updatedTask);
    await expect(manager.listTasks()).resolves.toEqual({
      dailySummary: updatedTask
    });

    await expect(manager.deleteTask("dailySummary")).resolves.toBe(true);
    await expect(manager.listTasks()).resolves.toEqual({});
    expect(statusStore.delete).toHaveBeenCalledWith("dailySummary");
  });
});

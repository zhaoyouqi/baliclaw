import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  runScheduledTaskCreateCommand,
  runScheduledTaskDeleteCommand,
  runScheduledTaskListCommand,
  runScheduledTaskStatusCommand,
  runScheduledTaskUpdateCommand
} from "../src/cli/commands/scheduled-tasks.js";

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

describe("CLI scheduled task commands", () => {
  it("lists scheduled tasks through IPC", async () => {
    const client = {
      listScheduledTasks: vi.fn().mockResolvedValue({
        dailySummary: task
      })
    } as never;

    await expect(runScheduledTaskListCommand(client)).resolves.toBe(
      JSON.stringify({ dailySummary: task }, null, 2)
    );
  });

  it("shows scheduled task status through IPC", async () => {
    const client = {
      getScheduledTaskStatus: vi.fn().mockResolvedValue({
        status: "succeeded",
        finishedAt: "2026-04-08T00:00:00.000Z"
      })
    } as never;

    await expect(runScheduledTaskStatusCommand("dailySummary", client)).resolves.toBe(
      JSON.stringify({
        taskId: "dailySummary",
        status: {
          status: "succeeded",
          finishedAt: "2026-04-08T00:00:00.000Z"
        }
      }, null, 2)
    );
  });

  it("creates a scheduled task from inline JSON5", async () => {
    const client = {
      createScheduledTask: vi.fn().mockResolvedValue(task)
    } as never;

    await expect(
      runScheduledTaskCreateCommand(
        "dailySummary",
        '{ schedule: { kind: "daily", time: "09:00" }, prompt: "Summarize", delivery: { channel: "telegram", accountId: "default", chatType: "direct", conversationId: "42" } }',
        {},
        client
      )
    ).resolves.toContain("\"dailySummary\"");
    expect(client.createScheduledTask).toHaveBeenCalledWith("dailySummary", task);
  });

  it("updates a scheduled task from a file payload", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-cli-scheduled-task-"));
    const file = join(home, "task.json5");
    const client = {
      updateScheduledTask: vi.fn().mockResolvedValue({
        ...task,
        timeoutMinutes: 45
      })
    } as never;

    try {
      await writeFile(
        file,
        '{ schedule: { kind: "daily", time: "09:00" }, prompt: "Summarize", delivery: { channel: "telegram", accountId: "default", chatType: "direct", conversationId: "42" }, timeoutMinutes: 45 }\n',
        "utf8"
      );

      await runScheduledTaskUpdateCommand("dailySummary", undefined, { file }, client);

      expect(client.updateScheduledTask).toHaveBeenCalledWith("dailySummary", {
        ...task,
        timeoutMinutes: 45
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("deletes a scheduled task through IPC", async () => {
    const client = {
      deleteScheduledTask: vi.fn().mockResolvedValue(true)
    } as never;

    await expect(runScheduledTaskDeleteCommand("dailySummary", client)).resolves.toBe(
      JSON.stringify({
        taskId: "dailySummary",
        deleted: true
      }, null, 2)
    );
  });
});

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAppPaths } from "../src/config/paths.js";
import {
  getDefaultScheduledTaskFileConfig,
  ScheduledTaskConfigService,
  scheduledTaskFileSchema
} from "../src/config/scheduled-task-config.js";
import { AppError, appErrorCodes } from "../src/shared/errors.js";

describe("scheduledTaskFileSchema", () => {
  it("parses supported schedule kinds", () => {
    const config = scheduledTaskFileSchema.parse({
      tasks: {
        everySixHours: {
          schedule: {
            kind: "everyHours",
            intervalHours: 6
          },
          prompt: "Ping",
          delivery: {
            channel: "telegram",
            accountId: "default",
            chatType: "direct",
            conversationId: "123"
          }
        },
        daily: {
          schedule: {
            kind: "daily",
            time: "09:00"
          },
          prompt: "Summarize",
          delivery: {
            channel: "telegram",
            accountId: "default",
            chatType: "direct",
            conversationId: "123"
          }
        },
        weekly: {
          schedule: {
            kind: "weekly",
            days: ["mon", "fri"],
            time: "18:30"
          },
          prompt: "Report",
          delivery: {
            channel: "telegram",
            accountId: "default",
            chatType: "direct",
            conversationId: "123"
          }
        }
      }
    });

    expect(config.tasks.everySixHours?.timeoutMinutes).toBe(30);
    expect(config.tasks.weekly?.schedule).toEqual({
      kind: "weekly",
      days: ["mon", "fri"],
      time: "18:30"
    });
  });

  it("rejects invalid task definitions", () => {
    expect(() =>
      scheduledTaskFileSchema.parse({
        tasks: {
          broken: {
            schedule: {
              kind: "daily",
              time: "9am"
            },
            prompt: "",
            delivery: {
              channel: "telegram",
              accountId: "default",
              chatType: "direct",
              conversationId: ""
            }
          }
        }
      })
    ).toThrow();
  });

  it("provides an empty default task file", () => {
    expect(getDefaultScheduledTaskFileConfig()).toEqual({ tasks: {} });
  });
});

describe("ScheduledTaskConfigService", () => {
  it("creates a default task file when missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-scheduled-task-defaults-"));
    const paths = getAppPaths(home);

    try {
      await mkdir(paths.rootDir, { recursive: true });
      const service = new ScheduledTaskConfigService(paths);
      const config = await service.load();

      expect(config).toEqual({ tasks: {} });
      await expect(readFile(paths.scheduledTasksFile, "utf8")).resolves.toContain("tasks");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("returns a structured error for invalid task files", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-scheduled-task-invalid-"));
    const paths = getAppPaths(home);

    try {
      await mkdir(paths.rootDir, { recursive: true });
      await writeFile(
        paths.scheduledTasksFile,
        `{
          tasks: {
            badTask: {
              schedule: {
                kind: "weekly",
                time: "18:00"
              },
              prompt: "x",
              delivery: {
                channel: "telegram",
                accountId: "default",
                chatType: "direct",
                conversationId: "123"
              }
            }
          }
        }\n`,
        "utf8"
      );

      await expect(new ScheduledTaskConfigService(paths).load()).rejects.toMatchObject<AppError>({
        code: appErrorCodes.configInvalid
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

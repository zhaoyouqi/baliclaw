import { describe, expect, it } from "vitest";
import { IpcClient } from "../src/ipc/client.js";
import { AppError, appErrorCodes } from "../src/shared/errors.js";
import { getAppPaths } from "../src/config/paths.js";
import type { AppConfig } from "../src/config/schema.js";

describe("IpcClient", () => {
  it("returns shared AppStatus payloads for valid socket responses", async () => {
    const client = new IpcClient({
      requestJson: async (path) => {
        if (path === "/v1/status") {
          return {
            statusCode: 200,
            body: { ok: true, service: "baliclaw", version: "test" }
          };
        }

        throw new Error(`unexpected path: ${path}`);
      }
    });

    await expect(client.getStatus()).resolves.toEqual({
      ok: true,
      service: "baliclaw",
      version: "test"
    });
  });

  it("throws AppError with centralized code for invalid responses", async () => {
    const client = new IpcClient({
      requestJson: async () => {
        return {
          statusCode: 200,
          body: { ok: true, service: "other", version: "test" } as unknown as { ok: true; service: "baliclaw"; version: string }
        };
      }
    });

    await expect(client.getStatus()).rejects.toMatchObject<AppError>({
      name: "AppError",
      code: appErrorCodes.ipcInvalidResponse
    });
  });

  it("fails immediately when the daemon socket is unavailable", async () => {
    const client = new IpcClient({
      paths: getAppPaths("/tmp/definitely-missing-home")
    });

    await expect(client.getStatus()).rejects.toMatchObject<AppError>({
      code: appErrorCodes.ipcUnavailable,
      message: "BaliClaw daemon is not running"
    });
  });

  it("supports config get and set over the shared transport", async () => {
    const config: AppConfig = {
      channels: {
        telegram: {
          enabled: false,
          botToken: ""
        }
      },
      runtime: {
        workingDirectory: "/tmp/baliclaw",
        loadFilesystemSettings: true
      },
      tools: {
        availableTools: ["Bash"]
      },
      skills: {
        enabled: true,
        directories: []
      },
      logging: {
        level: "info"
      },
      scheduledTasks: {
        enabled: false,
        file: ""
      },
      mcp: {
        servers: {}
      },
      agents: {},
      memory: {
        enabled: true,
        globalEnabled: false,
        maxLines: 200
      }
    };
    const client = new IpcClient({
      requestJson: async (path, init) => {
        if (path === "/v1/config" && init?.method !== "POST") {
          return {
            statusCode: 200,
            body: config
          };
        }

        if (path === "/v1/config/set" && init?.method === "POST") {
          return {
            statusCode: 200,
            body: init.body
          };
        }

        throw new Error(`unexpected path: ${path}`);
      }
    });

    await expect(client.getConfig()).resolves.toEqual(config);
    await expect(client.setConfig(config)).resolves.toEqual(config);
  });

  it("supports pairing list and approve over the shared transport", async () => {
    const request = {
      channel: "telegram",
      accountId: "default",
      code: "ABCD2345",
      principalKey: "42",
      username: "alice",
      createdAt: "2026-03-23T09:00:00.000Z",
      expiresAt: "2026-03-23T10:00:00.000Z"
    };
    const client = new IpcClient({
      requestJson: async (path, init) => {
        if (path === "/v1/pairing/list?channel=telegram") {
          return {
            statusCode: 200,
            body: {
              channel: "telegram",
              requests: [request]
            }
          };
        }

        if (path === "/v1/pairing/approve" && init?.method === "POST") {
          return {
            statusCode: 200,
            body: {
              channel: "telegram",
              approved: request
            }
          };
        }

        throw new Error(`unexpected path: ${path}`);
      }
    });

    await expect(client.listPairingRequests("telegram")).resolves.toEqual([request]);
    await expect(client.approvePairingCode("telegram", "ABCD2345")).resolves.toEqual(request);
  });

  it("supports scheduled task management over the shared transport", async () => {
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
    const client = new IpcClient({
      requestJson: async (path, init) => {
        if (path === "/v1/scheduled-tasks") {
          return {
            statusCode: 200,
            body: {
              tasks: {
                dailySummary: task
              }
            }
          };
        }

        if (path === "/v1/scheduled-tasks/create" && init?.method === "POST") {
          return {
            statusCode: 200,
            body: {
              taskId: "dailySummary",
              task
            }
          };
        }

        if (path === "/v1/scheduled-tasks/update" && init?.method === "POST") {
          return {
            statusCode: 200,
            body: {
              taskId: "dailySummary",
              task: {
                ...task,
                timeoutMinutes: 45
              }
            }
          };
        }

        if (path === "/v1/scheduled-tasks/delete" && init?.method === "POST") {
          return {
            statusCode: 200,
            body: {
              taskId: "dailySummary",
              deleted: true
            }
          };
        }

        if (path === "/v1/scheduled-tasks/status?taskId=dailySummary") {
          return {
            statusCode: 200,
            body: {
              taskId: "dailySummary",
              status: {
                status: "succeeded",
                finishedAt: "2026-04-08T00:00:00.000Z"
              }
            }
          };
        }

        throw new Error(`unexpected path: ${path}`);
      }
    });

    await expect(client.listScheduledTasks()).resolves.toEqual({
      dailySummary: task
    });
    await expect(client.createScheduledTask("dailySummary", task)).resolves.toEqual(task);
    await expect(client.updateScheduledTask("dailySummary", task)).resolves.toEqual({
      ...task,
      timeoutMinutes: 45
    });
    await expect(client.deleteScheduledTask("dailySummary")).resolves.toBe(true);
    await expect(client.getScheduledTaskStatus("dailySummary")).resolves.toEqual({
      status: "succeeded",
      finishedAt: "2026-04-08T00:00:00.000Z"
    });
  });
});

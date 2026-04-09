import { request } from "node:http";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAppPaths } from "../src/config/paths.js";
import { IpcServer } from "../src/ipc/server.js";
import { APP_VERSION } from "../src/shared/version.js";

interface JsonResponse {
  statusCode: number;
  body: unknown;
}

async function requestJson(
  socketPath: string,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {}
): Promise<JsonResponse> {
  return await new Promise<JsonResponse>((resolve, reject) => {
    const requestBody = init.body === undefined ? undefined : JSON.stringify(init.body);
    const req = request(
      {
        socketPath,
        path,
        method: init.method ?? "GET",
        headers: requestBody
          ? {
              "content-type": "application/json",
              "content-length": Buffer.byteLength(requestBody)
            }
          : undefined
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: JSON.parse(raw)
          });
        });
      }
    );

    req.on("error", reject);
    if (requestBody) {
      req.write(requestBody);
    }
    req.end();
  });
}

describe("IpcServer", () => {
  it("serves ping and status over the configured unix socket", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-ipc-server-"));
    const paths = getAppPaths(home);
    const server = new IpcServer({
      paths,
      getStatus: () => ({
        ok: true,
        service: "baliclaw",
        version: "test"
      })
    });

    try {
      await server.start();

      await expect(requestJson(paths.socketFile, "/v1/ping")).resolves.toEqual({
        statusCode: 200,
        body: { ok: true }
      });
      await expect(requestJson(paths.socketFile, "/v1/status")).resolves.toEqual({
        statusCode: 200,
        body: {
          ok: true,
          service: "baliclaw",
          version: "test"
        }
      });
    } finally {
      await server.stop();
      await rm(home, { recursive: true, force: true });
    }
  });

  it("returns structured json errors for unknown routes", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-ipc-404-"));
    const paths = getAppPaths(home);
    const server = new IpcServer({ paths });

    try {
      await server.start();

      await expect(requestJson(paths.socketFile, "/v1/missing")).resolves.toEqual({
        statusCode: 404,
        body: {
          ok: false,
          error: {
            code: "IPC_ROUTE_NOT_FOUND",
            message: "No IPC route for GET /v1/missing"
          }
        }
      });
    } finally {
      await server.stop();
      await rm(home, { recursive: true, force: true });
    }
  });

  it("uses the package version for the default status response", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-ipc-version-"));
    const paths = getAppPaths(home);
    const server = new IpcServer({ paths });

    try {
      await server.start();

      await expect(requestJson(paths.socketFile, "/v1/status")).resolves.toEqual({
        statusCode: 200,
        body: {
          ok: true,
          service: "baliclaw",
          version: APP_VERSION
        }
      });
    } finally {
      await server.stop();
      await rm(home, { recursive: true, force: true });
    }
  });

  it("serves pairing list and approve routes over the configured unix socket", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-ipc-pairing-"));
    const paths = getAppPaths(home);
    const server = new IpcServer({
      paths,
      pairingService: {
        listPendingRequests: async () => [
          {
            channel: "telegram",
            accountId: "default",
            code: "ABCD2345",
            principalKey: "42",
            username: "alice",
            createdAt: "2026-03-23T09:00:00.000Z",
            expiresAt: "2026-03-23T10:00:00.000Z"
          }
        ],
        approve: async () => ({
          channel: "telegram",
          accountId: "default",
          code: "ABCD2345",
          principalKey: "42",
          username: "alice",
          createdAt: "2026-03-23T09:00:00.000Z",
          expiresAt: "2026-03-23T10:00:00.000Z"
        })
      } as never
    });

    try {
      await server.start();

      await expect(requestJson(paths.socketFile, "/v1/pairing/list?channel=telegram")).resolves.toEqual({
        statusCode: 200,
        body: {
          channel: "telegram",
          requests: [
            {
              channel: "telegram",
              accountId: "default",
              code: "ABCD2345",
              principalKey: "42",
              username: "alice",
              createdAt: "2026-03-23T09:00:00.000Z",
              expiresAt: "2026-03-23T10:00:00.000Z"
            }
          ]
        }
      });

      await expect(
        requestJson(paths.socketFile, "/v1/pairing/approve", {
          method: "POST",
          body: {
            channel: "telegram",
            code: "ABCD2345"
          }
        })
      ).resolves.toEqual({
        statusCode: 200,
        body: {
          channel: "telegram",
          approved: {
            channel: "telegram",
            accountId: "default",
            code: "ABCD2345",
            principalKey: "42",
            username: "alice",
            createdAt: "2026-03-23T09:00:00.000Z",
            expiresAt: "2026-03-23T10:00:00.000Z"
          }
        }
      });
    } finally {
      await server.stop();
      await rm(home, { recursive: true, force: true });
    }
  });

  it("serves scheduled task management routes over the configured unix socket", async () => {
    const home = await mkdtemp(join(tmpdir(), "bc-ipc-st-"));
    const paths = getAppPaths(home);
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
    const server = new IpcServer({
      paths,
      scheduledTaskManager: {
        listTasks: async () => ({
          dailySummary: task
        }),
        createTask: async () => task,
        updateTask: async () => ({
          ...task,
          timeoutMinutes: 45
        }),
        deleteTask: async () => true,
        getTaskStatus: async () => ({
          status: "succeeded",
          finishedAt: "2026-04-08T00:00:00.000Z"
        })
      } as never
    });

    try {
      await server.start();

      await expect(requestJson(paths.socketFile, "/v1/scheduled-tasks")).resolves.toEqual({
        statusCode: 200,
        body: {
          tasks: {
            dailySummary: task
          }
        }
      });

      await expect(
        requestJson(paths.socketFile, "/v1/scheduled-tasks/create", {
          method: "POST",
          body: {
            taskId: "dailySummary",
            task
          }
        })
      ).resolves.toEqual({
        statusCode: 200,
        body: {
          taskId: "dailySummary",
          task
        }
      });

      await expect(
        requestJson(paths.socketFile, "/v1/scheduled-tasks/update", {
          method: "POST",
          body: {
            taskId: "dailySummary",
            task
          }
        })
      ).resolves.toEqual({
        statusCode: 200,
        body: {
          taskId: "dailySummary",
          task: {
            ...task,
            timeoutMinutes: 45
          }
        }
      });

      await expect(
        requestJson(paths.socketFile, "/v1/scheduled-tasks/delete", {
          method: "POST",
          body: {
            taskId: "dailySummary"
          }
        })
      ).resolves.toEqual({
        statusCode: 200,
        body: {
          taskId: "dailySummary",
          deleted: true
        }
      });

      await expect(
        requestJson(paths.socketFile, "/v1/scheduled-tasks/status?taskId=dailySummary")
      ).resolves.toEqual({
        statusCode: 200,
        body: {
          taskId: "dailySummary",
          status: {
            status: "succeeded",
            finishedAt: "2026-04-08T00:00:00.000Z"
          }
        }
      });
    } finally {
      await server.stop();
      await rm(home, { recursive: true, force: true });
    }
  });

  it("removes the socket file when the server stops", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-ipc-stale-"));
    const paths = getAppPaths(home);
    const server = new IpcServer({ paths });

    try {
      await server.start();
      await access(paths.socketFile);
      await server.stop();

      await expect(access(paths.socketFile)).rejects.toBeDefined();
    } finally {
      await server.stop();
      await rm(home, { recursive: true, force: true });
    }
  });
});

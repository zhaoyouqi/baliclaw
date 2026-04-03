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
      code: "ABCD2345",
      senderId: "42",
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
});

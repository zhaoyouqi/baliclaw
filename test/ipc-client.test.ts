import { describe, expect, it } from "vitest";
import { IpcClient } from "../src/ipc/client.js";
import { AppError, appErrorCodes } from "../src/shared/errors.js";

describe("IpcClient", () => {
  it("returns a shared AppStatus payload for valid responses", async () => {
    const client = new IpcClient({
      async getStatus() {
        return { ok: true, service: "baliclaw", version: "test" };
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
      async getStatus() {
        return { ok: true, service: "other", version: "test" } as unknown as { ok: true; service: "baliclaw"; version: string };
      }
    });

    await expect(client.getStatus()).rejects.toMatchObject<AppError>({
      name: "AppError",
      code: appErrorCodes.ipcInvalidResponse
    });
  });
});

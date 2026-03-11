import { appErrorCodes, toAppError } from "../shared/errors.js";
import type { AppStatus } from "../shared/types.js";
import { statusResponseSchema } from "./schema.js";
import { IpcServer } from "./server.js";

export class IpcClient {
  constructor(private readonly server = new IpcServer()) {}

  async getStatus(): Promise<AppStatus> {
    try {
      const result = await this.server.getStatus();
      return statusResponseSchema.parse(result);
    } catch (error) {
      throw toAppError(error, {
        message: "Invalid IPC status response",
        code: appErrorCodes.ipcInvalidResponse
      });
    }
  }
}

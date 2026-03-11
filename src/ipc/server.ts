import type { AppStatus } from "../shared/types.js";

export class IpcServer {
  async getStatus(): Promise<AppStatus> {
    return {
      ok: true,
      service: "baliclaw",
      version: "0.1.0"
    };
  }
}

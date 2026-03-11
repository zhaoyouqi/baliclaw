import type { StatusResponse } from "./schema.js";

export class IpcServer {
  async getStatus(): Promise<StatusResponse> {
    return {
      ok: true,
      service: "baliclaw",
      version: "0.1.0"
    };
  }
}


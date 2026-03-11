import { IpcServer } from "./server.js";
import type { StatusResponse } from "./schema.js";

export class IpcClient {
  constructor(private readonly server = new IpcServer()) {}

  getStatus(): Promise<StatusResponse> {
    return this.server.getStatus();
  }
}


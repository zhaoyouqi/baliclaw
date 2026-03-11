import { IpcClient } from "../ipc/client.js";

export function createCliClient(): IpcClient {
  return new IpcClient();
}


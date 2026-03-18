import { IpcServer } from "../server.js";

export async function handleStatus(server = new IpcServer()) {
  return server.getStatus();
}

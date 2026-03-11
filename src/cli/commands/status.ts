import { createCliClient } from "../client.js";

export async function runStatusCommand(): Promise<string> {
  const status = await createCliClient().getStatus();
  return JSON.stringify(status, null, 2);
}


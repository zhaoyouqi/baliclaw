import { createCliClient } from "../client.js";

export async function runConfigGetCommand(): Promise<string> {
  const config = await createCliClient().getConfig();
  return JSON.stringify(config, null, 2);
}

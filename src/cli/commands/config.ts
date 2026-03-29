import { readFile } from "node:fs/promises";
import JSON5 from "json5";
import { createCliClient } from "../client.js";
import { appConfigSchema, type AppConfig } from "../../config/schema.js";
import type { IpcClient } from "../../ipc/client.js";

export async function runConfigGetCommand(client: IpcClient = createCliClient()): Promise<string> {
  const config = await client.getConfig();
  return JSON.stringify(config, null, 2);
}

export async function runConfigSetCommand(
  rawConfig: string | undefined,
  options: { file?: string; path?: string } = {},
  client: IpcClient = createCliClient()
): Promise<string> {
  if (options.path) {
    const saved = await setConfigPathValue(options.path, rawConfig, client);
    return JSON.stringify(saved, null, 2);
  }

  const config = await parseConfigInput(rawConfig, options);
  const saved = await client.setConfig(config);
  return JSON.stringify(saved, null, 2);
}

async function parseConfigInput(
  rawConfig: string | undefined,
  options: { file?: string }
): Promise<AppConfig> {
  const raw = options.file
    ? await readFile(options.file, "utf8")
    : rawConfig;

  if (!raw) {
    throw new Error("Provide config JSON5 inline or with --file <path>.");
  }

  return appConfigSchema.parse(JSON5.parse(raw));
}

async function setConfigPathValue(
  path: string,
  rawValue: string | undefined,
  client: IpcClient
): Promise<AppConfig> {
  if (!rawValue) {
    throw new Error("Provide a value when using --path <config.path>.");
  }

  const current = await client.getConfig();
  const next = structuredClone(current);
  const segments = path.split(".").filter(Boolean);

  if (segments.length === 0) {
    throw new Error("Config path must not be empty.");
  }

  let cursor: Record<string, unknown> = next as Record<string, unknown>;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!segment) {
      throw new Error(`Unknown config path: ${path}`);
    }
    const value = cursor[segment];

    if (!isPlainObject(value)) {
      throw new Error(`Unknown config path: ${path}`);
    }

    cursor = value;
  }

  const leaf = segments[segments.length - 1];
  if (!leaf || !(leaf in cursor)) {
    throw new Error(`Unknown config path: ${path}`);
  }

  cursor[leaf] = parseScalarOrJson5(rawValue);
  return await client.setConfig(appConfigSchema.parse(next));
}

function parseScalarOrJson5(rawValue: string): unknown {
  try {
    return JSON5.parse(rawValue);
  } catch {
    return rawValue;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

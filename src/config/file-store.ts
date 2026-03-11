import { readFile } from "node:fs/promises";
import JSON5 from "json5";
import { atomicWrite } from "../shared/atomic-write.js";

export async function readJson5File<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON5.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson5File(path: string, value: unknown): Promise<void> {
  const contents = JSON5.stringify(value, null, 2);
  await atomicWrite(path, `${contents}\n`);
}


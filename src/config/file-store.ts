import { readFile } from "node:fs/promises";
import JSON5 from "json5";
import { atomicWrite } from "../shared/atomic-write.js";

export async function readJson5File<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON5.parse(raw) as T;
}

export async function readJson5FileOrDefault<T>(path: string, fallback: T): Promise<T> {
  try {
    return await readJson5File<T>(path);
  } catch (error) {
    if (isMissingFileError(error)) {
      return fallback;
    }

    throw error;
  }
}

export async function writeJson5File(path: string, value: unknown): Promise<void> {
  const contents = JSON5.stringify(value, null, 2);
  await atomicWrite(path, `${contents}\n`);
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

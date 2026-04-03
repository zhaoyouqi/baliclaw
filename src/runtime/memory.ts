import { mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { AppPaths } from "../config/paths.js";

export interface ReadMemoryOptions {
  paths: AppPaths;
  workingDirectory: string;
  maxLines: number;
}

export function getProjectMemoryHash(workingDirectory: string): string {
  return createHash("sha1").update(workingDirectory).digest("hex").slice(0, 12);
}

export function getProjectMemoryDirectory(paths: AppPaths, workingDirectory: string): string {
  return join(paths.memoryProjectsDir, getProjectMemoryHash(workingDirectory));
}

export function getProjectMemoryFilePath(paths: AppPaths, workingDirectory: string): string {
  return join(getProjectMemoryDirectory(paths, workingDirectory), "MEMORY.md");
}

export async function readMemory(options: ReadMemoryOptions): Promise<string> {
  const memoryDirectory = getProjectMemoryDirectory(options.paths, options.workingDirectory);
  await mkdir(memoryDirectory, { recursive: true });

  try {
    const content = await readFile(getProjectMemoryFilePath(options.paths, options.workingDirectory), "utf8");
    return truncateLines(content, options.maxLines);
  } catch (error) {
    if (isMissingFileError(error)) {
      return "";
    }

    throw error;
  }
}

function truncateLines(content: string, maxLines: number): string {
  return content.split("\n").slice(0, maxLines).join("\n").trim();
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

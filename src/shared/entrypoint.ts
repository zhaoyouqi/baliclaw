import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function isExecutedAsScript(importMetaUrl: string, argv1: string | undefined): boolean {
  if (!argv1) {
    return false;
  }

  const currentFile = normalizePath(fileURLToPath(importMetaUrl));
  const executedFile = normalizePath(argv1);

  return currentFile === executedFile;
}

function normalizePath(path: string): string {
  const resolved = resolve(path);

  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

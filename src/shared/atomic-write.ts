import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function atomicWrite(path: string, contents: string): Promise<void> {
  const dir = dirname(path);
  const tempPath = `${path}.tmp`;
  await mkdir(dir, { recursive: true });
  await writeFile(tempPath, contents, "utf8");
  await rename(tempPath, path);
}


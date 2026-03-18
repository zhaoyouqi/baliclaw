import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface AtomicWriteFs {
  mkdir: typeof mkdir;
  rename: typeof rename;
  rm: typeof rm;
  writeFile: typeof writeFile;
}

const defaultFs: AtomicWriteFs = {
  mkdir,
  rename,
  rm,
  writeFile
};

export async function atomicWrite(
  path: string,
  contents: string,
  fs: AtomicWriteFs = defaultFs
): Promise<void> {
  const dir = dirname(path);
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await fs.mkdir(dir, { recursive: true });

  try {
    await fs.writeFile(tempPath, contents, "utf8");
    await fs.rename(tempPath, path);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

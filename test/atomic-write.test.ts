import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { atomicWrite, type AtomicWriteFs } from "../src/shared/atomic-write.js";

describe("atomicWrite", () => {
  it("creates parent directories and writes the target file", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-atomic-write-"));
    const target = join(home, "nested", "config.json");

    try {
      await atomicWrite(target, "{\"ok\":true}");

      await expect(readFile(target, "utf8")).resolves.toBe("{\"ok\":true}");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("replaces existing file contents without leaving temp files behind", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-atomic-replace-"));
    const target = join(home, "store.json");

    try {
      await writeFile(target, "{\"version\":1}", "utf8");

      await atomicWrite(target, "{\"version\":2}");

      await expect(readFile(target, "utf8")).resolves.toBe("{\"version\":2}");
      await expect(readdir(home)).resolves.toEqual(["store.json"]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("keeps the original file when rename fails", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-atomic-failure-"));
    const target = join(home, "pairing.json");
    const renameError = new Error("rename failed");

    try {
      await writeFile(target, "{\"state\":\"original\"}", "utf8");

      const failingFs: AtomicWriteFs = {
        mkdir,
        writeFile,
        rename: vi.fn<typeof import("node:fs/promises").rename>().mockRejectedValue(renameError),
        rm
      };

      await expect(atomicWrite(target, "{\"state\":\"new\"}", failingFs)).rejects.toThrow("rename failed");
      await expect(readFile(target, "utf8")).resolves.toBe("{\"state\":\"original\"}");
      await expect(readdir(home)).resolves.toEqual(["pairing.json"]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

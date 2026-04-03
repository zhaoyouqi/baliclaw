import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isExecutedAsScript } from "../src/shared/entrypoint.js";

describe("isExecutedAsScript", () => {
  it("returns false when argv[1] is missing", () => {
    expect(isExecutedAsScript("file:///tmp/example.js", undefined)).toBe(false);
  });

  it("returns true when import.meta.url and argv[1] reference the same file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "baliclaw-entrypoint-"));
    const file = join(directory, "index.js");

    try {
      await writeFile(file, "", "utf8");

      expect(isExecutedAsScript(`file://${file}`, file)).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns true when argv[1] is a symlink to the current file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "baliclaw-entrypoint-link-"));
    const file = join(directory, "index.js");
    const link = join(directory, "linked.js");

    try {
      await writeFile(file, "", "utf8");
      await symlink(file, link);

      expect(isExecutedAsScript(`file://${file}`, link)).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

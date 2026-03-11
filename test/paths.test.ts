import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureStateDirectories, getAppPaths } from "../src/config/paths.js";

describe("getAppPaths", () => {
  it("derives the managed state files under ~/.baliclaw", () => {
    const paths = getAppPaths("/tmp/example-home");
    expect(paths.rootDir).toBe("/tmp/example-home/.baliclaw");
    expect(paths.configFile).toBe("/tmp/example-home/.baliclaw/baliclaw.json5");
    expect(paths.socketFile).toBe("/tmp/example-home/.baliclaw/baliclaw.sock");
    expect(paths.pendingPairingFile).toBe("/tmp/example-home/.baliclaw/pairing/telegram-pending.json");
    expect(paths.allowlistFile).toBe("/tmp/example-home/.baliclaw/pairing/telegram-allowlist.json");
    expect(paths.logFile).toBe("/tmp/example-home/.baliclaw/logs/daemon.log");
  });
});

describe("ensureStateDirectories", () => {
  it("creates root, pairing, and logs directories", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-home-"));
    try {
      const paths = getAppPaths(home);
      await ensureStateDirectories(paths);

      const stateDir = await stat(paths.rootDir);
      const pairingDir = await stat(paths.pairingDir);
      const logsDir = await stat(paths.logsDir);

      expect(stateDir.isDirectory()).toBe(true);
      expect(pairingDir.isDirectory()).toBe(true);
      expect(logsDir.isDirectory()).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

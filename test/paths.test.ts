import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureStateDirectories, getAppPaths } from "../src/config/paths.js";

describe("getAppPaths", () => {
  it("derives the managed state files under ~/.baliclaw", () => {
    const paths = getAppPaths("/tmp/example-home");
    expect(paths.rootDir).toBe("/tmp/example-home/.baliclaw");
    expect(paths.workspaceDir).toBe("/tmp/example-home/.baliclaw/workspace");
    expect(paths.configFile).toBe("/tmp/example-home/.baliclaw/baliclaw.json5");
    expect(paths.scheduledTasksFile).toBe("/tmp/example-home/.baliclaw/scheduled-tasks.json5");
    expect(paths.socketFile).toBe("/tmp/example-home/.baliclaw/baliclaw.sock");
    expect(paths.pendingPairingFile).toBe("/tmp/example-home/.baliclaw/pairing/telegram/default-pending.json");
    expect(paths.allowlistFile).toBe("/tmp/example-home/.baliclaw/pairing/telegram/default-allowlist.json");
    expect(paths.scheduledTasksDir).toBe("/tmp/example-home/.baliclaw/scheduled-tasks");
    expect(paths.scheduledTaskStatusFile).toBe("/tmp/example-home/.baliclaw/scheduled-tasks/status.json");
    expect(paths.memoryDir).toBe("/tmp/example-home/.baliclaw/memory");
    expect(paths.memoryGlobalDir).toBe("/tmp/example-home/.baliclaw/memory/global");
    expect(paths.memoryProjectsDir).toBe("/tmp/example-home/.baliclaw/memory/projects");
    expect(paths.logFile).toBe("/tmp/example-home/.baliclaw/logs/daemon.log");
  });
});

describe("ensureStateDirectories", () => {
  it("creates root, pairing, scheduled task, memory, and logs directories", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-home-"));
    try {
      const paths = getAppPaths(home);
      await ensureStateDirectories(paths);

      const stateDir = await stat(paths.rootDir);
      const workspaceDir = await stat(paths.workspaceDir);
      const pairingDir = await stat(paths.pairingDir);
      const scheduledTasksDir = await stat(paths.scheduledTasksDir);
      const memoryGlobalDir = await stat(paths.memoryGlobalDir);
      const memoryProjectsDir = await stat(paths.memoryProjectsDir);
      const logsDir = await stat(paths.logsDir);

      expect(stateDir.isDirectory()).toBe(true);
      expect(workspaceDir.isDirectory()).toBe(true);
      expect(pairingDir.isDirectory()).toBe(true);
      expect(scheduledTasksDir.isDirectory()).toBe(true);
      expect(memoryGlobalDir.isDirectory()).toBe(true);
      expect(memoryProjectsDir.isDirectory()).toBe(true);
      expect(logsDir.isDirectory()).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AppPaths {
  rootDir: string;
  workspaceDir: string;
  configFile: string;
  socketFile: string;
  pairingDir: string;
  sessionDir: string;
  memoryDir: string;
  memoryGlobalDir: string;
  memoryProjectsDir: string;
  claudeSessionMapFile: string;
  pendingPairingFile: string;
  allowlistFile: string;
  logsDir: string;
  logFile: string;
}

export function getAppPaths(home = homedir()): AppPaths {
  const rootDir = join(home, ".baliclaw");
  const workspaceDir = join(rootDir, "workspace");
  const pairingDir = join(rootDir, "pairing");
  const sessionDir = join(rootDir, "sessions");
  const memoryDir = join(rootDir, "memory");
  const memoryGlobalDir = join(memoryDir, "global");
  const memoryProjectsDir = join(memoryDir, "projects");
  const logsDir = join(rootDir, "logs");

  return {
    rootDir,
    workspaceDir,
    configFile: join(rootDir, "baliclaw.json5"),
    socketFile: join(rootDir, "baliclaw.sock"),
    pairingDir,
    sessionDir,
    memoryDir,
    memoryGlobalDir,
    memoryProjectsDir,
    claudeSessionMapFile: join(sessionDir, "claude-sessions.json"),
    pendingPairingFile: join(pairingDir, "telegram-pending.json"),
    allowlistFile: join(pairingDir, "telegram-allowlist.json"),
    logsDir,
    logFile: join(logsDir, "daemon.log")
  };
}

export async function ensureStateDirectories(paths: AppPaths = getAppPaths()): Promise<void> {
  await Promise.all([
    mkdir(paths.rootDir, { recursive: true }),
    mkdir(paths.workspaceDir, { recursive: true }),
    mkdir(paths.pairingDir, { recursive: true }),
    mkdir(paths.sessionDir, { recursive: true }),
    mkdir(paths.memoryGlobalDir, { recursive: true }),
    mkdir(paths.memoryProjectsDir, { recursive: true }),
    mkdir(paths.logsDir, { recursive: true })
  ]);
}

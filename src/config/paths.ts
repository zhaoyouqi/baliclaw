import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AppPaths {
  rootDir: string;
  workspaceDir: string;
  configFile: string;
  scheduledTasksFile: string;
  socketFile: string;
  pairingDir: string;
  sessionDir: string;
  scheduledTasksDir: string;
  scheduledTaskStatusFile: string;
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
  const scheduledTasksDir = join(rootDir, "scheduled-tasks");
  const memoryDir = join(rootDir, "memory");
  const memoryGlobalDir = join(memoryDir, "global");
  const memoryProjectsDir = join(memoryDir, "projects");
  const logsDir = join(rootDir, "logs");
  const pendingPairingFile = buildPairingPendingFile(pairingDir, "telegram", "default");
  const allowlistFile = buildPairingAllowlistFile(pairingDir, "telegram", "default");

  return {
    rootDir,
    workspaceDir,
    configFile: join(rootDir, "baliclaw.json5"),
    scheduledTasksFile: join(rootDir, "scheduled-tasks.json5"),
    socketFile: join(rootDir, "baliclaw.sock"),
    pairingDir,
    sessionDir,
    scheduledTasksDir,
    scheduledTaskStatusFile: join(scheduledTasksDir, "status.json"),
    memoryDir,
    memoryGlobalDir,
    memoryProjectsDir,
    claudeSessionMapFile: join(sessionDir, "claude-sessions.json"),
    pendingPairingFile,
    allowlistFile,
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
    mkdir(paths.scheduledTasksDir, { recursive: true }),
    mkdir(paths.memoryGlobalDir, { recursive: true }),
    mkdir(paths.memoryProjectsDir, { recursive: true }),
    mkdir(paths.logsDir, { recursive: true })
  ]);
}

export function getPendingPairingFile(paths: AppPaths, channel: string, accountId: string): string {
  return buildPairingPendingFile(paths.pairingDir, channel, accountId);
}

export function getAllowlistPairingFile(paths: AppPaths, channel: string, accountId: string): string {
  return buildPairingAllowlistFile(paths.pairingDir, channel, accountId);
}

function buildPairingPendingFile(pairingDir: string, channel: string, accountId: string): string {
  return join(pairingDir, sanitizePairingPathSegment(channel), `${sanitizePairingPathSegment(accountId)}-pending.json`);
}

function buildPairingAllowlistFile(pairingDir: string, channel: string, accountId: string): string {
  return join(pairingDir, sanitizePairingPathSegment(channel), `${sanitizePairingPathSegment(accountId)}-allowlist.json`);
}

function sanitizePairingPathSegment(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  const sanitized = trimmed.replace(/[^A-Za-z0-9._-]+/g, "_");
  return sanitized.length > 0 ? sanitized : "default";
}

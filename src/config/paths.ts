import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AppPaths {
  rootDir: string;
  configFile: string;
  socketFile: string;
  pairingDir: string;
  pendingPairingFile: string;
  allowlistFile: string;
  logsDir: string;
  logFile: string;
}

export function getAppPaths(home = homedir()): AppPaths {
  const rootDir = join(home, ".baliclaw");
  const pairingDir = join(rootDir, "pairing");
  const logsDir = join(rootDir, "logs");

  return {
    rootDir,
    configFile: join(rootDir, "baliclaw.json5"),
    socketFile: join(rootDir, "baliclaw.sock"),
    pairingDir,
    pendingPairingFile: join(pairingDir, "telegram-pending.json"),
    allowlistFile: join(pairingDir, "telegram-allowlist.json"),
    logsDir,
    logFile: join(logsDir, "daemon.log")
  };
}

export async function ensureStateDirectories(paths: AppPaths = getAppPaths()): Promise<void> {
  await Promise.all([
    mkdir(paths.rootDir, { recursive: true }),
    mkdir(paths.pairingDir, { recursive: true }),
    mkdir(paths.logsDir, { recursive: true })
  ]);
}

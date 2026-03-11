import { homedir } from "node:os";
import { join } from "node:path";

export interface AppPaths {
  rootDir: string;
  configFile: string;
  socketFile: string;
  pairingStoreFile: string;
  logFile: string;
}

export function getAppPaths(home = homedir()): AppPaths {
  const rootDir = join(home, ".baliclaw");
  return {
    rootDir,
    configFile: join(rootDir, "config.json5"),
    socketFile: join(rootDir, "baliclaw.sock"),
    pairingStoreFile: join(rootDir, "pairing-store.json"),
    logFile: join(rootDir, "baliclaw.log")
  };
}


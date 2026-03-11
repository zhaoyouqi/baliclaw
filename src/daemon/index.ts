import { bootstrap } from "./bootstrap.js";
import { logger } from "../shared/logger.js";

export async function runDaemon(): Promise<void> {
  const context = bootstrap();
  const config = await context.configService.load();
  logger.info({ cwd: config.runtime.cwd }, "daemon bootstrapped");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runDaemon();
}


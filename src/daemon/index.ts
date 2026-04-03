#!/usr/bin/env node

import { bootstrap, type BootstrapOptions } from "./bootstrap.js";
import type { ProcessSignalSource } from "./shutdown.js";
import { getLogger } from "../shared/logger.js";

const fallbackLogger = getLogger("daemon");

export interface RunDaemonOptions extends BootstrapOptions {
  onStarted?: () => void;
  processSource?: ProcessSignalSource;
}

export async function runDaemon(options: RunDaemonOptions = {}): Promise<void> {
  const context = await bootstrap(options);
  const removeSignalHandlers = context.shutdownController.installSignalHandlers(options.processSource);
  const keepAliveTimer = setInterval(() => undefined, 60_000);

  try {
    context.logger.info(
      {
        cwd: context.config.runtime.workingDirectory,
        telegramEnabled: context.config.channels.telegram.enabled
      },
      "daemon bootstrapped"
    );

    options.onStarted?.();
    await context.shutdownController.waitForShutdown();
  } catch (error) {
    fallbackLogger.error({ err: error }, "daemon failed during startup");
    throw error;
  } finally {
    clearInterval(keepAliveTimer);
    removeSignalHandlers();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runDaemon().catch((error) => {
    fallbackLogger.error({ err: error }, "daemon exited with error");
    process.exitCode = 1;
  });
}

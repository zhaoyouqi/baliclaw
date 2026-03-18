import type { Logger } from "pino";

export type ShutdownSignal = "SIGINT" | "SIGTERM";
type ShutdownReason = ShutdownSignal | "manual";

export interface ShutdownTask {
  name: string;
  close: () => Promise<void> | void;
}

export interface ProcessSignalSource {
  exitCode: number | string | null | undefined;
  on(event: ShutdownSignal, listener: () => void): this;
  off(event: ShutdownSignal, listener: () => void): this;
}

export interface ShutdownController {
  add(task: ShutdownTask): void;
  waitForShutdown(): Promise<void>;
  shutdown(reason?: ShutdownReason): Promise<void>;
  installSignalHandlers(processSource?: ProcessSignalSource): () => void;
}

export function createShutdownController(logger: Logger): ShutdownController {
  const tasks: ShutdownTask[] = [];
  let shuttingDown: Promise<void> | null = null;
  let resolveWait: (() => void) | undefined;
  const waitForShutdown = new Promise<void>((resolve) => {
    resolveWait = resolve;
  });

  const shutdown = async (reason: ShutdownReason = "manual"): Promise<void> => {
    if (shuttingDown) {
      return shuttingDown;
    }

    shuttingDown = (async () => {
      logger.info({ reason }, "daemon shutting down");

      let failed = false;

      for (const task of [...tasks].reverse()) {
        try {
          await task.close();
          logger.info({ task: task.name }, "shutdown task completed");
        } catch (error) {
          failed = true;
          logger.error({ err: error, task: task.name }, "shutdown task failed");
        }
      }

      if (failed) {
        logger.warn("daemon shutdown completed with errors");
      } else {
        logger.info("daemon shutdown complete");
      }

      resolveWait?.();
    })();

    return shuttingDown;
  };

  const installSignalHandlers = (processSource: ProcessSignalSource = process): (() => void) => {
    const handleSigint = () => {
      processSource.exitCode = 0;
      void shutdown("SIGINT");
    };
    const handleSigterm = () => {
      processSource.exitCode = 0;
      void shutdown("SIGTERM");
    };

    processSource.on("SIGINT", handleSigint);
    processSource.on("SIGTERM", handleSigterm);

    return () => {
      processSource.off("SIGINT", handleSigint);
      processSource.off("SIGTERM", handleSigterm);
    };
  };

  return {
    add(task: ShutdownTask): void {
      tasks.push(task);
    },
    waitForShutdown(): Promise<void> {
      return waitForShutdown;
    },
    shutdown,
    installSignalHandlers
  };
}

import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { bootstrap } from "../src/daemon/bootstrap.js";
import { runDaemon } from "../src/daemon/index.js";
import { createShutdownController } from "../src/daemon/shutdown.js";
import { getAppPaths } from "../src/config/paths.js";
import type { AppConfig } from "../src/config/schema.js";
import { createLogger } from "../src/shared/logger.js";

class FakeProcess extends EventEmitter {
  exitCode: number | undefined;

  override on(event: "SIGINT" | "SIGTERM", listener: () => void): this {
    return super.on(event, listener);
  }

  override off(event: "SIGINT" | "SIGTERM", listener: () => void): this {
    return super.off(event, listener);
  }
}

const defaultConfig: AppConfig = {
  telegram: {
    enabled: false,
    botToken: ""
  },
  runtime: {
    workingDirectory: "/tmp/baliclaw"
  },
  tools: {
    availableTools: ["Bash", "Read", "Write", "Edit"]
  },
  skills: {
    enabled: true,
    directories: []
  },
  logging: {
    level: "info"
  }
};

describe("bootstrap", () => {
  it("creates state directories and loads config before returning context", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-bootstrap-"));
    const paths = getAppPaths(home);
    const configService = {
      load: vi.fn<() => Promise<AppConfig>>().mockResolvedValue(defaultConfig)
    } as never;

    try {
      const context = await bootstrap({ paths, configService });

      expect(context.paths).toEqual(paths);
      expect(context.config).toEqual(defaultConfig);
      expect(context.configService).toBe(configService);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("starts telegram only when enabled and registers a stop hook", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-bootstrap-tg-"));
    const paths = getAppPaths(home);
    const telegramService = {
      start: vi.fn<() => Promise<void>>().mockResolvedValue(),
      stop: vi.fn<() => Promise<void>>().mockResolvedValue()
    } as never;

    try {
      const context = await bootstrap({
        paths,
        telegramService,
        configService: {
          load: vi.fn<() => Promise<AppConfig>>().mockResolvedValue({
            ...defaultConfig,
            telegram: {
              enabled: true,
              botToken: "secret"
            }
          })
        } as never
      });

      expect(telegramService.start).toHaveBeenCalledTimes(1);

      await context.shutdownController.shutdown();

      expect(telegramService.stop).toHaveBeenCalledTimes(1);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe("shutdown", () => {
  it("runs shutdown tasks in reverse registration order and only once", async () => {
    const calls: string[] = [];
    const logger = createLogger({ subsystem: "daemon" });
    const controller = createShutdownController(logger);

    controller.add({
      name: "first",
      close: () => {
        calls.push("first");
      }
    });
    controller.add({
      name: "second",
      close: () => {
        calls.push("second");
      }
    });

    await Promise.all([controller.shutdown(), controller.shutdown("SIGTERM")]);

    expect(calls).toEqual(["second", "first"]);
  });
});

describe("runDaemon", () => {
  it("waits for a shutdown signal and exits cleanly", async () => {
    const processSource = new FakeProcess();
    const home = await mkdtemp(join(tmpdir(), "baliclaw-run-"));

    try {
      const waitForSignal = runDaemon({
        onStarted: () => {
          processSource.emit("SIGTERM");
        },
        processSource,
        configService: {
          load: vi.fn<() => Promise<AppConfig>>().mockResolvedValue(defaultConfig)
        } as never,
        telegramService: {
          start: vi.fn<() => Promise<void>>().mockResolvedValue(),
          stop: vi.fn<() => Promise<void>>().mockResolvedValue()
        } as never,
        paths: getAppPaths(home)
      });

      await expect(waitForSignal).resolves.toBeUndefined();
      expect(processSource.exitCode).toBe(0);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

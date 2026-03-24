import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config/schema.js";
import { createLogger } from "../src/shared/logger.js";
import { ReloadService } from "../src/daemon/reload-service.js";

const initialConfig: AppConfig = {
  telegram: {
    enabled: false,
    botToken: ""
  },
  runtime: {
    workingDirectory: "/tmp/initial"
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

describe("ReloadService", () => {
  it("reloads config when the watched config file changes", async () => {
    let onChange: ((eventType: "rename" | "change", filename: string | Buffer | null) => void) | undefined;
    const nextConfig: AppConfig = {
      ...initialConfig,
      runtime: {
        workingDirectory: "/tmp/reloaded"
      },
      logging: {
        level: "debug"
      }
    };
    const applyConfig = vi.fn();
    const service = new ReloadService({
      initialConfig,
      configService: {
        load: vi.fn().mockResolvedValue(nextConfig)
      } as never,
      paths: {
        configFile: "/tmp/home/.baliclaw/baliclaw.json5"
      } as never,
      watchConfigDirectory: ((_path, listener) => {
        onChange = listener as typeof onChange;
        return {
          close: vi.fn()
        } as never;
      }) as never,
      applyConfig,
      debounceMs: 0
    });

    await service.start();
    onChange?.("change", "baliclaw.json5");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(applyConfig).toHaveBeenCalledWith(nextConfig, initialConfig);
    expect(service.getConfig()).toEqual(nextConfig);
  });

  it("keeps the previous config when a watched reload fails", async () => {
    let onChange: ((eventType: "rename" | "change", filename: string | Buffer | null) => void) | undefined;
    const destination = { write: vi.fn(() => true) };
    const logger = createLogger({ subsystem: "config", destination });
    const service = new ReloadService({
      initialConfig,
      configService: {
        load: vi.fn().mockRejectedValue(new Error("broken config"))
      } as never,
      paths: {
        configFile: "/tmp/home/.baliclaw/baliclaw.json5"
      } as never,
      watchConfigDirectory: ((_path, listener) => {
        onChange = listener as typeof onChange;
        return {
          close: vi.fn()
        } as never;
      }) as never,
      logger,
      applyConfig: vi.fn(),
      debounceMs: 0
    });

    await service.start();
    onChange?.("change", "baliclaw.json5");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.getConfig()).toEqual(initialConfig);
    expect(destination.write).toHaveBeenCalled();
  });
});

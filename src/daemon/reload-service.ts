import { watch, type FSWatcher } from "node:fs";
import { basename, dirname } from "node:path";
import type { Logger } from "pino";
import { ConfigService } from "../config/service.js";
import { getAppPaths, type AppPaths } from "../config/paths.js";
import type { AppConfig } from "../config/schema.js";
import { getLogger } from "../shared/logger.js";

export interface ReloadServiceOptions {
  initialConfig: AppConfig;
  applyConfig: (nextConfig: AppConfig, previousConfig: AppConfig) => Promise<void> | void;
  paths?: AppPaths;
  configService?: ConfigService;
  logger?: Logger;
  watchConfigDirectory?: typeof watch;
  debounceMs?: number;
}

type WatchEvent = "rename" | "change";

type FsWatcherLike = Pick<FSWatcher, "close">;

export class ReloadService {
  private readonly paths: AppPaths;
  private readonly configService: ConfigService;
  private readonly logger: Logger;
  private readonly applyConfig: ReloadServiceOptions["applyConfig"];
  private readonly watchConfigDirectory: typeof watch;
  private readonly debounceMs: number;
  private watcher: FsWatcherLike | null = null;
  private reloadTimer: NodeJS.Timeout | null = null;
  private currentConfig: AppConfig;

  constructor(options: ReloadServiceOptions) {
    this.paths = options.paths ?? getAppPaths();
    this.configService = options.configService ?? new ConfigService(this.paths);
    this.logger = options.logger ?? getLogger("config");
    this.applyConfig = options.applyConfig;
    this.watchConfigDirectory = options.watchConfigDirectory ?? watch;
    this.debounceMs = options.debounceMs ?? 50;
    this.currentConfig = options.initialConfig;
  }

  getConfig(): AppConfig {
    return this.currentConfig;
  }

  async start(): Promise<void> {
    if (this.watcher) {
      return;
    }

    this.watcher = this.watchConfigDirectory(
      dirname(this.paths.configFile),
      (_eventType: WatchEvent, filename: string | Buffer | null) => {
        if (!shouldReloadForFile(this.paths.configFile, filename)) {
          return;
        }

        this.scheduleReload("watch");
      }
    );
  }

  async stop(): Promise<void> {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }

    this.watcher?.close();
    this.watcher = null;
  }

  async reload(reason: "watch" | "ipc" | "manual" = "manual"): Promise<AppConfig> {
    const nextConfig = await this.configService.load();
    const previousConfig = this.currentConfig;

    await this.applyConfig(nextConfig, previousConfig);
    this.currentConfig = nextConfig;

    this.logger.info({ reason }, "config reloaded");
    return nextConfig;
  }

  private scheduleReload(reason: "watch"): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }

    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      void this.reload(reason).catch((error: unknown) => {
        this.logger.error({ err: error, reason }, "config reload failed");
      });
    }, this.debounceMs);
  }
}

function shouldReloadForFile(configFile: string, filename: string | Buffer | null): boolean {
  if (!filename) {
    return true;
  }

  return filename.toString() === basename(configFile);
}

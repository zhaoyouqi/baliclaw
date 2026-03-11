import { getAppPaths, type AppPaths } from "./paths.js";
import { readJson5File, writeJson5File } from "./file-store.js";
import { appConfigSchema, getDefaultConfig, type AppConfig } from "./schema.js";

export class ConfigService {
  constructor(private readonly paths: AppPaths = getAppPaths()) {}

  async load(): Promise<AppConfig> {
    const config = await readJson5File(this.paths.configFile, getDefaultConfig());
    return appConfigSchema.parse(config);
  }

  async save(config: AppConfig): Promise<void> {
    await writeJson5File(this.paths.configFile, config);
  }
}


import { appErrorCodes, toAppError } from "../shared/errors.js";
import { readJson5File, writeJson5File } from "./file-store.js";
import { getAppPaths, type AppPaths } from "./paths.js";
import { appConfigSchema, getDefaultConfig, type AppConfig } from "./schema.js";

export class ConfigService {
  constructor(private readonly paths: AppPaths = getAppPaths()) {}

  async load(): Promise<AppConfig> {
    try {
      const config = await readJson5File(this.paths.configFile, getDefaultConfig());
      return appConfigSchema.parse(config);
    } catch (error) {
      throw toAppError(error, {
        message: "Invalid configuration file",
        code: appErrorCodes.configInvalid
      });
    }
  }

  async save(config: AppConfig): Promise<void> {
    await writeJson5File(this.paths.configFile, config);
  }
}

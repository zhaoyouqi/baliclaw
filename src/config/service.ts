import { ZodError } from "zod";
import { AppError, appErrorCodes, toAppError } from "../shared/errors.js";
import { readJson5FileOrDefault, writeJson5File } from "./file-store.js";
import { getAppPaths, type AppPaths } from "./paths.js";
import { appConfigSchema, getDefaultConfig, type AppConfig } from "./schema.js";

export class ConfigService {
  constructor(private readonly paths: AppPaths = getAppPaths()) {}

  async load(): Promise<AppConfig> {
    try {
      const config = await readJson5FileOrDefault(this.paths.configFile, getDefaultConfig());
      return appConfigSchema.parse(config);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AppError(
          "Invalid configuration file",
          appErrorCodes.configInvalid,
          error,
          {
            issues: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
              code: issue.code
            }))
          }
        );
      }

      throw toAppError(error, {
        message: "Invalid configuration file",
        code: appErrorCodes.configInvalid
      });
    }
  }

  async save(config: AppConfig): Promise<void> {
    const parsed = appConfigSchema.parse(config);
    await writeJson5File(this.paths.configFile, parsed);
  }
}

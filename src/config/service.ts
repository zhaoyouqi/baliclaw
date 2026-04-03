import { ZodError } from "zod";
import { AppError, appErrorCodes, toAppError } from "../shared/errors.js";
import { readJson5File, writeJson5File } from "./file-store.js";
import { getAppPaths, type AppPaths } from "./paths.js";
import { appConfigSchema, getDefaultConfig, type AppConfig } from "./schema.js";
import { ensureWorkspaceScaffold } from "./workspace.js";

export class ConfigService {
  constructor(private readonly paths: AppPaths = getAppPaths()) {}

  async load(): Promise<AppConfig> {
    try {
      const loaded = await readJson5File<Partial<AppConfig>>(this.paths.configFile);
      return normalizeConfig(loaded, this.paths);
    } catch (error) {
      if (isMissingFileError(error)) {
        const config = normalizeConfig({}, this.paths);
        await writeJson5File(this.paths.configFile, config);
        await ensureWorkspaceScaffold(config.runtime.workingDirectory);
        return config;
      }

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

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function normalizeConfig(config: Partial<AppConfig>, paths: AppPaths): AppConfig {
  const defaults = getDefaultConfig(paths);

  return appConfigSchema.parse({
    ...defaults,
    ...config,
    channels: {
      ...defaults.channels,
      ...config.channels
    },
    runtime: {
      ...defaults.runtime,
      ...config.runtime
    },
    tools: {
      ...defaults.tools,
      ...config.tools
    },
    skills: {
      ...defaults.skills,
      ...config.skills
    },
    logging: {
      ...defaults.logging,
      ...config.logging
    },
    mcp: {
      ...defaults.mcp,
      ...config.mcp,
      servers: {
        ...defaults.mcp.servers,
        ...config.mcp?.servers
      }
    },
    agents: {
      ...defaults.agents,
      ...config.agents
    },
    memory: {
      ...defaults.memory,
      ...config.memory
    }
  });
}

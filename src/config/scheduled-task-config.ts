import { ZodError, z } from "zod";
import { AppError, appErrorCodes, toAppError } from "../shared/errors.js";
import { readJson5File, writeJson5File } from "./file-store.js";
import { getAppPaths, type AppPaths } from "./paths.js";

const scheduledTaskScheduleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("everyHours"),
    intervalHours: z.number().int().positive()
  }).strict(),
  z.object({
    kind: z.literal("daily"),
    time: z.string().regex(/^\d{2}:\d{2}$/)
  }).strict(),
  z.object({
    kind: z.literal("weekly"),
    days: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).min(1),
    time: z.string().regex(/^\d{2}:\d{2}$/)
  }).strict()
]);

export const scheduledTaskDeliverySchema = z.object({
  channel: z.string().trim().min(1),
  accountId: z.string().trim().min(1).default("default"),
  chatType: z.enum(["direct", "group", "channel"]),
  conversationId: z.string().trim().min(1),
  threadId: z.string().trim().min(1).optional()
}).strict();

export const scheduledTaskDefinitionSchema = z.object({
  schedule: scheduledTaskScheduleSchema,
  prompt: z.string().min(1),
  delivery: scheduledTaskDeliverySchema,
  timeoutMinutes: z.number().int().positive().default(30)
}).strict();

export const scheduledTaskFileSchema = z.object({
  tasks: z.record(z.string(), scheduledTaskDefinitionSchema).default({})
}).strict();

export type ScheduledTaskScheduleConfig = z.infer<typeof scheduledTaskScheduleSchema>;
export type ScheduledTaskDefinitionConfig = z.infer<typeof scheduledTaskDefinitionSchema>;
export type ScheduledTaskFileConfig = z.infer<typeof scheduledTaskFileSchema>;

export function getDefaultScheduledTaskFileConfig(): ScheduledTaskFileConfig {
  return scheduledTaskFileSchema.parse({});
}

export class ScheduledTaskConfigService {
  constructor(
    private readonly paths: AppPaths = getAppPaths(),
    private readonly path = paths.scheduledTasksFile
  ) {}

  getPath(): string {
    return this.path;
  }

  async load(): Promise<ScheduledTaskFileConfig> {
    try {
      const loaded = await readJson5File<Partial<ScheduledTaskFileConfig>>(this.path);
      return scheduledTaskFileSchema.parse(loaded);
    } catch (error) {
      if (isMissingFileError(error)) {
        const config = getDefaultScheduledTaskFileConfig();
        await writeJson5File(this.path, config);
        return config;
      }

      if (error instanceof ZodError) {
        throw new AppError(
          "Invalid scheduled task configuration file",
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
        message: "Invalid scheduled task configuration file",
        code: appErrorCodes.configInvalid
      });
    }
  }

  async save(config: ScheduledTaskFileConfig): Promise<void> {
    const parsed = scheduledTaskFileSchema.parse(config);
    await writeJson5File(this.path, parsed);
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

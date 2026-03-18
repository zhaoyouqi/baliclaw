import { z } from "zod";

export const defaultAvailableTools = ["Bash", "Read", "Write", "Edit"] as const;

const telegramConfigSchema = z.object({
  enabled: z.boolean().default(false),
  botToken: z.string().default("")
}).strict();

const runtimeConfigSchema = z.object({
  model: z.string().optional(),
  maxTurns: z.number().int().positive().optional(),
  workingDirectory: z.string().default(process.cwd()),
  systemPromptFile: z.string().optional()
}).strict();

const toolsConfigSchema = z.object({
  availableTools: z.array(z.string()).default([...defaultAvailableTools])
}).strict();

const skillsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  directories: z.array(z.string()).default([])
}).strict();

const loggingConfigSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]).default("info")
}).strict();

function withObjectDefaults<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => value ?? {}, schema);
}

export const appConfigSchema = z.object({
  telegram: withObjectDefaults(telegramConfigSchema),
  runtime: withObjectDefaults(runtimeConfigSchema),
  tools: withObjectDefaults(toolsConfigSchema),
  skills: withObjectDefaults(skillsConfigSchema),
  logging: withObjectDefaults(loggingConfigSchema)
}).strict().superRefine((config, context) => {
  if (config.telegram.enabled && config.telegram.botToken.trim().length === 0) {
    context.addIssue({
      code: "custom",
      message: "telegram.botToken is required when telegram.enabled is true",
      path: ["telegram", "botToken"]
    });
  }
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export function getDefaultConfig(): AppConfig {
  return appConfigSchema.parse({});
}

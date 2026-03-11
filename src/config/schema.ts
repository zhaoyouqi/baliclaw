import { z } from "zod";

export const appConfigSchema = z.object({
  telegram: z.object({
    botToken: z.string().default(""),
    pollingTimeoutSeconds: z.number().int().positive().default(30)
  }),
  runtime: z.object({
    cwd: z.string().default(process.cwd()),
    permissionMode: z.literal("bypassPermissions").default("bypassPermissions")
  }),
  skills: z.object({
    promptDirs: z.array(z.string()).default([])
  })
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export function getDefaultConfig(): AppConfig {
  return appConfigSchema.parse({});
}


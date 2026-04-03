import { z } from "zod";

export const defaultAvailableTools = ["Bash", "Read", "Write", "Edit"] as const;

function withObjectDefaults<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => value ?? {}, schema);
}

const mcpServerStdioSchema = z.object({
  type: z.literal("stdio").default("stdio"),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({})
}).strict();

const mcpServerHttpSchema = z.object({
  type: z.enum(["http", "sse"]),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).default({})
}).strict();

const mcpServerSchema = z.union([mcpServerStdioSchema, mcpServerHttpSchema]);

const mcpConfigSchema = z.object({
  servers: z.record(z.string(), mcpServerSchema).default({})
}).strict();

export type McpServerStdioConfig = z.infer<typeof mcpServerStdioSchema>;
export type McpServerHttpConfig = z.infer<typeof mcpServerHttpSchema>;
export type McpServerConfig = z.infer<typeof mcpServerSchema>;

const agentDefinitionSchema = z.object({
  description: z.string(),
  prompt: z.string().optional(),
  promptFile: z.string().optional(),
  tools: z.array(z.string()).optional(),
  model: z.enum(["sonnet", "opus", "haiku", "inherit"]).optional(),
  skills: z.array(z.string()).optional(),
  mcpServers: z.array(z.string()).optional()
}).strict().refine(
  (agent) => agent.prompt !== undefined || agent.promptFile !== undefined,
  { message: "Either prompt or promptFile must be specified" }
);

export type AgentDefinitionConfig = z.infer<typeof agentDefinitionSchema>;

const telegramConfigSchema = z.object({
  enabled: z.boolean().default(false),
  botToken: z.string().default("")
}).strict();

const channelsConfigSchema = z.object({
  telegram: withObjectDefaults(telegramConfigSchema)
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

const memoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  globalEnabled: z.boolean().default(false),
  maxLines: z.number().int().positive().default(200)
}).strict();

export const appConfigSchema = z.object({
  channels: withObjectDefaults(channelsConfigSchema),
  runtime: withObjectDefaults(runtimeConfigSchema),
  tools: withObjectDefaults(toolsConfigSchema),
  skills: withObjectDefaults(skillsConfigSchema),
  logging: withObjectDefaults(loggingConfigSchema),
  mcp: withObjectDefaults(mcpConfigSchema),
  agents: z.record(z.string(), agentDefinitionSchema).default({}),
  memory: withObjectDefaults(memoryConfigSchema)
}).strict().superRefine((config, context) => {
  if (config.channels.telegram.enabled && config.channels.telegram.botToken.trim().length === 0) {
    context.addIssue({
      code: "custom",
      message: "channels.telegram.botToken is required when channels.telegram.enabled is true",
      path: ["channels", "telegram", "botToken"]
    });
  }
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export function getDefaultConfig(): AppConfig {
  return appConfigSchema.parse({});
}

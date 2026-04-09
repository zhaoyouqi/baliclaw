import { z } from "zod";
import { appConfigSchema } from "../config/schema.js";
import {
  scheduledTaskDefinitionSchema,
  scheduledTaskFileSchema
} from "../config/scheduled-task-config.js";
import { scheduledTaskStatusEntrySchema } from "../runtime/scheduled-task-status-store.js";

const pairingChannelSchema = z.string().trim().min(1);

export const pairingRequestSchema = z.object({
  channel: z.string(),
  accountId: z.string(),
  code: z.string(),
  principalKey: z.string(),
  username: z.string().optional(),
  createdAt: z.string(),
  expiresAt: z.string()
});

export const pingResponseSchema = z.object({
  ok: z.literal(true)
});

export const statusResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("baliclaw"),
  version: z.string()
});

export const configResponseSchema = appConfigSchema;

export const scheduledTaskListResponseSchema = z.object({
  tasks: z.record(z.string(), scheduledTaskDefinitionSchema)
});

export const scheduledTaskCreateRequestSchema = z.object({
  taskId: z.string().trim().min(1),
  task: scheduledTaskDefinitionSchema
});

export const scheduledTaskCreateResponseSchema = z.object({
  taskId: z.string(),
  task: scheduledTaskDefinitionSchema
});

export const scheduledTaskUpdateRequestSchema = scheduledTaskCreateRequestSchema;

export const scheduledTaskUpdateResponseSchema = scheduledTaskCreateResponseSchema;

export const scheduledTaskDeleteRequestSchema = z.object({
  taskId: z.string().trim().min(1)
});

export const scheduledTaskDeleteResponseSchema = z.object({
  taskId: z.string(),
  deleted: z.boolean()
});

export const scheduledTaskStatusResponseSchema = z.object({
  taskId: z.string(),
  status: scheduledTaskStatusEntrySchema.optional()
});

export const pairingListResponseSchema = z.object({
  channel: pairingChannelSchema,
  requests: z.array(pairingRequestSchema)
});

export const pairingApproveRequestSchema = z.object({
  channel: pairingChannelSchema,
  code: z.string().trim().min(1)
});

export const pairingApproveResponseSchema = z.object({
  channel: pairingChannelSchema,
  approved: pairingRequestSchema
});

export const ipcErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string()
  })
});

export type PingResponse = z.infer<typeof pingResponseSchema>;
export type StatusResponse = z.infer<typeof statusResponseSchema>;
export type ConfigResponse = z.infer<typeof configResponseSchema>;
export type ScheduledTaskListResponse = z.infer<typeof scheduledTaskListResponseSchema>;
export type ScheduledTaskCreateRequest = z.infer<typeof scheduledTaskCreateRequestSchema>;
export type ScheduledTaskCreateResponse = z.infer<typeof scheduledTaskCreateResponseSchema>;
export type ScheduledTaskUpdateRequest = z.infer<typeof scheduledTaskUpdateRequestSchema>;
export type ScheduledTaskUpdateResponse = z.infer<typeof scheduledTaskUpdateResponseSchema>;
export type ScheduledTaskDeleteRequest = z.infer<typeof scheduledTaskDeleteRequestSchema>;
export type ScheduledTaskDeleteResponse = z.infer<typeof scheduledTaskDeleteResponseSchema>;
export type ScheduledTaskStatusResponse = z.infer<typeof scheduledTaskStatusResponseSchema>;
export type PairingListResponse = z.infer<typeof pairingListResponseSchema>;
export type PairingApproveRequest = z.infer<typeof pairingApproveRequestSchema>;
export type PairingApproveResponse = z.infer<typeof pairingApproveResponseSchema>;
export type IpcErrorResponse = z.infer<typeof ipcErrorResponseSchema>;

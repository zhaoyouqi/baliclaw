import { z } from "zod";
import { appConfigSchema } from "../config/schema.js";

export const pingResponseSchema = z.object({
  ok: z.literal(true)
});

export const statusResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("baliclaw"),
  version: z.string()
});

export const configResponseSchema = appConfigSchema;

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
export type IpcErrorResponse = z.infer<typeof ipcErrorResponseSchema>;

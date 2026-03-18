import { z } from "zod";

export const pingResponseSchema = z.object({
  ok: z.literal(true)
});

export const statusResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("baliclaw"),
  version: z.string()
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
export type IpcErrorResponse = z.infer<typeof ipcErrorResponseSchema>;

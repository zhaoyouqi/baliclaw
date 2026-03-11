import { z } from "zod";

export const statusResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("baliclaw"),
  version: z.string()
});

export type StatusResponse = z.infer<typeof statusResponseSchema>;

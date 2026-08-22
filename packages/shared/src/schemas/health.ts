import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  uptimeSeconds: z.number().int().min(0),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Readiness probe: per-dependency status; the API refuses traffic on "error". */
export const readinessResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "error"]),
  checks: z.object({
    database: z.enum(["ok", "error"]),
    redis: z.enum(["ok", "skipped", "error"]),
  }),
  timestamp: z.string().datetime(),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

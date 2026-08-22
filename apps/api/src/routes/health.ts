import type { FastifyPluginAsync } from "fastify";
import { healthResponseSchema, readinessResponseSchema } from "@reclaimr/shared";

/**
 * Liveness: is the process up? Never touches dependencies, so an orchestrator
 * restarts only a genuinely wedged process.
 */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    const payload = {
      status: "ok" as const,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
    healthResponseSchema.parse(payload);
    return payload;
  });

  /**
   * Readiness: can this instance serve traffic? Checks Postgres (required)
   * and Redis (optional). Reports 503 while dependencies recover.
   */
  app.get("/ready", async (_request, reply) => {
    let database: "ok" | "error" = "ok";
    try {
      await app.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = "error";
    }

    let redis: "ok" | "skipped" | "error" = "skipped";
    if (app.redis) {
      try {
        const pong = await app.redis.ping();
        redis = pong === "PONG" ? "ok" : "error";
      } catch {
        redis = "error";
      }
    }

    const status = database === "error" ? "error" : redis === "error" ? "degraded" : "ok";
    const payload = { status, checks: { database, redis }, timestamp: new Date().toISOString() };
    readinessResponseSchema.parse(payload);

    if (status === "error") return reply.code(503).send(payload);
    return payload;
  });
};

import Redis from "ioredis";
import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { env } from "../env";

declare module "fastify" {
  interface FastifyInstance {
    /** Null when REDIS_URL is not configured (dev without Redis). */
    redis: Redis | null;
  }
}

/**
 * Optional Redis connection, used by the rate limiter (and future cache /
 * queue layers). The API degrades to in-memory rate limiting without it, so
 * local dev works with zero infrastructure.
 */
export const redisPlugin: FastifyPluginAsync = fp(
  async (app) => {
    const url = env().REDIS_URL;
    if (!url) {
      await app.decorate("redis", null);
      app.log.warn("REDIS_URL not set — running without Redis (in-memory rate limiting)");
      return;
    }

    const redis = new Redis(url, {
      lazyConnect: false,
      // Bound the damage when Redis is down: plugin calls fail fast instead
      // of hanging requests for the default 20s command timeout.
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });

    redis.on("error", (error) => app.log.error({ err: error }, "Redis error"));
    redis.on("connect", () => app.log.info("Redis connected"));

    await app.decorate("redis", redis);
    app.addHook("onClose", async () => {
      redis.disconnect();
    });
  },
  { name: "redis" },
);

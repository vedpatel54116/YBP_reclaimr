import Redis from "ioredis";

/**
 * Dedicated Redis connection factory for BullMQ workers. Workers block on
 * BRPOP-style commands, so they need `maxRetriesPerRequest: null`
 * (the ioredis default of 20 would surface spurious errors).
 */
export function createWorkerRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

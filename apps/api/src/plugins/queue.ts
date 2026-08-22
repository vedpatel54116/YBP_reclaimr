import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { JobProducer } from "@reclaimr/queue";
import { env } from "../env";

declare module "fastify" {
  interface FastifyInstance {
    /**
     * BullMQ producer, or null when REDIS_URL is not configured — sync
     * requests then run inline in the request handler. The API never runs
     * workers (D7); consumption lives in apps/worker.
     */
    queue: JobProducer | null;
  }
}

export const queuePlugin: FastifyPluginAsync = fp(
  async (app) => {
    const url = env().REDIS_URL;
    if (!url) {
      await app.decorate("queue", null);
      app.log.warn("REDIS_URL not set — background jobs will run inline");
      return;
    }
    const producer = new JobProducer(url);
    await app.decorate("queue", producer);
    app.addHook("onClose", async () => {
      await producer.close();
    });
  },
  { name: "queue", dependencies: ["redis"] },
);

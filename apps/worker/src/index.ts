import { PrismaClient } from "@prisma/client";
import { Worker, type Processor } from "bullmq";
import { createAiServices, createBankingServices, env } from "@reclaimr/api/services";
import {
  ALL_QUEUES,
  createWorkerRedisConnection,
  JobProducer,
  QUEUE_CONCURRENCY,
  QUEUE_NAMES,
  type QueueName,
} from "@reclaimr/queue";
import { loadEnvFiles } from "./env";
import { aiGenerateProcessor } from "./processors/ai-generate.processor";
import { plaidSyncProcessor } from "./processors/plaid-sync.processor";
import {
  billDetectionProcessor,
  subscriptionDetectionProcessor,
} from "./processors/detection.processor";
import { alertsProcessor } from "./processors/alerts.processor";
import { maintenanceProcessor } from "./processors/maintenance.processor";

/** Daily maintenance cron (UTC): fan out per-item syncs for every member. */
const MAINTENANCE_PATTERN = "0 6 * * *";

function parseWorkerQueues(raw: string | undefined): QueueName[] {
  if (!raw || raw === "all") return [...ALL_QUEUES];
  const requested = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const unknown = requested.filter((name) => !ALL_QUEUES.includes(name as QueueName));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown queues in WORKER_QUEUES: ${unknown.join(", ")} (valid: ${ALL_QUEUES.join(", ")})`,
    );
  }
  return requested as QueueName[];
}

async function main(): Promise<void> {
  loadEnvFiles();
  const config = env();

  if (!config.REDIS_URL) {
    console.error("@reclaimr/worker requires REDIS_URL (BullMQ has no inline fallback).");
    process.exit(1);
  }
  const redisUrl: string = config.REDIS_URL;

  const enabled = parseWorkerQueues(process.env.WORKER_QUEUES);
  console.log(`worker starting — queues: ${enabled.join(", ")}`);

  const prisma = new PrismaClient();
  const producer = new JobProducer(redisUrl);
  const banking = createBankingServices(prisma, config, { queue: producer });
  const ai = createAiServices(prisma, config, { queue: producer });

  const processors: Record<QueueName, Processor> = {
    [QUEUE_NAMES.plaidSync]: plaidSyncProcessor(banking, producer),
    [QUEUE_NAMES.detectionSubscriptions]: subscriptionDetectionProcessor(banking, ai, producer),
    [QUEUE_NAMES.detectionBills]: billDetectionProcessor(banking, producer),
    [QUEUE_NAMES.alertsEvaluate]: alertsProcessor(banking),
    [QUEUE_NAMES.maintenance]: maintenanceProcessor(prisma, producer),
    [QUEUE_NAMES.aiGenerate]: aiGenerateProcessor(ai),
  };

  // One connection per worker — BullMQ workers block on their connection.
  const workers = enabled.map(
    (name) =>
      new Worker(name, processors[name], {
        connection: createWorkerRedisConnection(redisUrl),
        concurrency: QUEUE_CONCURRENCY[name],
      }),
  );

  for (const worker of workers) {
    worker.on("failed", (job, error) => {
      console.error(
        `[worker:${worker.name}] job ${job?.id ?? "?"} failed (attempt ${job?.attemptsMade ?? "?"}): ${error.message}`,
      );
    });
  }

  // Register the daily maintenance repeatable job (idempotent: BullMQ
  // upserts repeatable schedules by name + pattern).
  if (enabled.includes(QUEUE_NAMES.maintenance)) {
    await producer.add(
      QUEUE_NAMES.maintenance,
      {},
      { jobOptions: { repeat: { pattern: MAINTENANCE_PATTERN, tz: "UTC" } } },
    );
    console.log(`maintenance scheduled — cron "${MAINTENANCE_PATTERN}" UTC`);
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      console.log(`worker received ${signal} — draining`);
      void (async () => {
        await Promise.allSettled(workers.map((worker) => worker.close()));
        await producer.close();
        await prisma.$disconnect();
        process.exit(0);
      })();
    });
  }
}

void main();

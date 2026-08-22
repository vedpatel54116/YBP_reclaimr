import type { PrismaClient } from "@prisma/client";
import type { Processor } from "bullmq";
import {
  dailySyncJobId,
  maintenanceJobSchema,
  QUEUE_NAMES,
  type JobProducer,
} from "@reclaimr/queue";

/**
 * Daily maintenance: enqueue a sync for every healthy item, deduplicated to
 * one sync per item per day (BullMQ suppresses repeated job ids).
 */
export function maintenanceProcessor(prisma: PrismaClient, producer: JobProducer): Processor {
  return async (job) => {
    maintenanceJobSchema.parse(job.data ?? {});
    const date = new Date(job.timestamp).toISOString().slice(0, 10);

    const items = await prisma.plaidItem.findMany({
      where: { status: "connected" },
      select: { id: true, userId: true },
    });

    for (const item of items) {
      await producer.add(
        QUEUE_NAMES.plaidSync,
        { userId: item.userId, plaidItemId: item.id },
        { jobId: dailySyncJobId(item.id, date) },
      );
    }
    job.log(`maintenance ${date}: enqueued ${items.length} item syncs`);
    return { date, enqueued: items.length };
  };
}

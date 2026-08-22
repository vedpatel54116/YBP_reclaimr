import type { Processor } from "bullmq";
import type { BankingServices } from "@reclaimr/api/services";
import { QUEUE_NAMES, plaidSyncJobSchema, type JobProducer } from "@reclaimr/queue";

/**
 * Incremental aggregator sync for one item. On success, fan out the
 * detection stages as their own jobs — each stage retries independently,
 * so a detection bug never blocks transaction ingestion.
 */
export function plaidSyncProcessor(banking: BankingServices, producer: JobProducer): Processor {
  return async (job) => {
    const payload = plaidSyncJobSchema.parse(job.data);
    const result = await banking.transactionSync.syncItem(payload.plaidItemId);
    job.log(
      `synced item ${payload.plaidItemId}: +${result.added} ~${result.updated} -${result.removed}`,
    );

    if (!result.requiresReauth) {
      await producer.add(QUEUE_NAMES.detectionSubscriptions, { userId: payload.userId });
      await producer.add(QUEUE_NAMES.detectionBills, { userId: payload.userId });
    }
    return result;
  };
}

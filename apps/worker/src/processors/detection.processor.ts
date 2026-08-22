import type { Processor } from "bullmq";
import type { AiServices, BankingServices } from "@reclaimr/api/services";
import { QUEUE_NAMES, detectionJobSchema, type JobProducer } from "@reclaimr/queue";

/** Recompute detected subscriptions for a member, then queue alert rules and
 *  refresh AI alternative advice for whatever detection just found. */
export function subscriptionDetectionProcessor(
  banking: BankingServices,
  ai: AiServices,
  producer: JobProducer,
): Processor {
  return async (job) => {
    const { userId } = detectionJobSchema.parse(job.data);
    const result = await banking.subscriptionDetection.runForUser(userId);
    job.log(
      `subscriptions: ${result.detected} detected, ${result.created} created, ${result.updated} updated`,
    );
    await producer.add(QUEUE_NAMES.alertsEvaluate, { userId });

    // One job per subscription: model calls are slow and rate-limited, so each
    // one retries and scales on its own rather than as a single fragile batch.
    const advice = await ai.advisor.enqueueForUser(userId);
    job.log(`ai: ${advice} advice jobs enqueued`);
    return result;
  };
}

/** Recompute detected bills for a member, then queue alert rules. */
export function billDetectionProcessor(banking: BankingServices, producer: JobProducer): Processor {
  return async (job) => {
    const { userId } = detectionJobSchema.parse(job.data);
    const result = await banking.billDetection.runForUser(userId);
    job.log(
      `bills: ${result.detected} detected, ${result.created} created, ${result.updated} updated`,
    );
    await producer.add(QUEUE_NAMES.alertsEvaluate, { userId });
    return result;
  };
}

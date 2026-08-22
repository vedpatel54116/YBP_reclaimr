import type { Processor } from "bullmq";
import type { BankingServices } from "@reclaimr/api/services";
import { alertsJobSchema } from "@reclaimr/queue";

/** Evaluate all standing alert rules for a member (dedup happens in the service). */
export function alertsProcessor(banking: BankingServices): Processor {
  return async (job) => {
    const { userId } = alertsJobSchema.parse(job.data);
    const created = await banking.alerts.evaluateUser(userId);
    job.log(`alerts: ${created} created`);
    return { created };
  };
}

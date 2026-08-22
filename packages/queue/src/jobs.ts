import { z } from "zod";

/**
 * Job payload contracts. Producers validate before enqueueing; workers
 * validate before processing — a malformed payload fails fast with a clear
 * error instead of corrupting state midway through a job.
 */

export const plaidSyncJobSchema = z.object({
  userId: z.string().uuid(),
  plaidItemId: z.string().uuid(),
});
export type PlaidSyncJob = z.infer<typeof plaidSyncJobSchema>;

export const detectionJobSchema = z.object({
  userId: z.string().uuid(),
});
export type DetectionJob = z.infer<typeof detectionJobSchema>;

export const alertsJobSchema = z.object({
  userId: z.string().uuid(),
});
export type AlertsJob = z.infer<typeof alertsJobSchema>;

export const maintenanceJobSchema = z.object({
  /** Present when a specific date is targeted; the daily scheduler derives
   *  it from the job timestamp instead. */
  date: z.string().date().optional(),
});
export type MaintenanceJob = z.infer<typeof maintenanceJobSchema>;

/**
 * AI suggestion kinds. Duplicated from @reclaimr/shared on purpose: this
 * package stays dependency-free so the queue contract cannot be broken by a
 * wire-schema refactor. The two lists are asserted equal in the shared tests.
 */
export const aiSuggestionKindSchema = z.enum([
  "alternative_advice",
  "alert_reasoning",
  "digest",
  "cancellation_plan",
  "negotiation_script",
]);
export type AiSuggestionKind = z.infer<typeof aiSuggestionKindSchema>;

export const aiGenerateJobSchema = z.object({
  userId: z.string().uuid(),
  kind: aiSuggestionKindSchema,
  /** Subject of the generation: subscription id, alert id, bill id, or userId. */
  subjectId: z.string().uuid(),
});
export type AiGenerateJob = z.infer<typeof aiGenerateJobSchema>;

/**
 * jobId builders. BullMQ suppresses a job whose id already exists in an
 * active or retained state, so these are only used where deduplication is
 * genuinely wanted — scheduled fan-out, which is unique per item per day.
 * Manual/event-driven jobs carry no custom id so retries and repeats always
 * enqueue.
 */
export function dailySyncJobId(plaidItemId: string, date: string): string {
  return `plaid.sync.daily:${plaidItemId}:${date}`;
}

export function dailyMaintenanceJobId(date: string): string {
  return `maintenance.daily:${date}`;
}

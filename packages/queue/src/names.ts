import type { JobsOptions } from "bullmq";

/**
 * Queue names, one per background concern. `apps/worker` consumes them; the
 * API only ever produces. Every job payload is userId-scoped — there is no
 * cross-tenant job surface.
 */
export const QUEUE_NAMES = {
  /** Incremental aggregator sync for one Plaid item (balances + transactions). */
  plaidSync: "plaid.sync",
  /** Recompute detected subscriptions for a member. */
  detectionSubscriptions: "detection.subscriptions",
  /** Recompute detected bills for a member. */
  detectionBills: "detection.bills",
  /** Evaluate alert rules for a member. */
  alertsEvaluate: "alerts.evaluate",
  /** Daily maintenance: fan out per-item sync jobs for all members. */
  maintenance: "maintenance",
  /** Generate/refresh one cached AI suggestion for a member. */
  aiGenerate: "ai.generate",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const ALL_QUEUES: readonly QueueName[] = Object.values(QUEUE_NAMES);

/**
 * Reliability defaults: bounded retries with exponential backoff, completed
 * jobs pruned after an hour, failed jobs kept for inspection.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 3_000 },
  removeOnComplete: { age: 3_600, count: 500 },
  removeOnFail: { age: 24 * 3_600 },
};

/** Worker concurrency defaults per queue. */
export const QUEUE_CONCURRENCY: Record<QueueName, number> = {
  [QUEUE_NAMES.plaidSync]: 4,
  [QUEUE_NAMES.detectionSubscriptions]: 2,
  [QUEUE_NAMES.detectionBills]: 2,
  [QUEUE_NAMES.alertsEvaluate]: 4,
  [QUEUE_NAMES.maintenance]: 1,
  // LLM calls are slow and rate-limited; keep the fan-out modest.
  [QUEUE_NAMES.aiGenerate]: 2,
};

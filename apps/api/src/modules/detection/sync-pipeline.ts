import { QUEUE_NAMES, type JobProducer } from "@reclaimr/queue";
import type { SyncResult } from "../transactions/transaction-sync.service";

export interface SyncPipelineDeps {
  /** Null when Redis/BullMQ is not configured — everything then runs inline. */
  queue: JobProducer | null;
  syncTransactions: { syncItem(plaidItemId: string, now?: Date): Promise<SyncResult> };
  detectSubscriptions: { runForUser(userId: string, now?: Date): Promise<unknown> };
  detectBills: { runForUser(userId: string, now?: Date): Promise<unknown> };
  evaluateAlerts: { evaluateUser(userId: string, now?: Date): Promise<number> };
  /**
   * Refreshes AI alternative advice. Only used on the inline path: in queued
   * mode the worker fans this out after detection, where it retries on its own.
   * Optional so the pipeline still composes before the AI graph exists.
   */
  refreshAdvice?: { runForUser(userId: string): Promise<number> };
}

/**
 * The sync pipeline: sync one item, then re-run detections and alerts for
 * its owner. With Redis the follow-ups are separate queue jobs (independent
 * retries, independent scaling); without Redis the whole chain runs inline
 * so local development needs zero infrastructure. Both paths run the exact
 * same services.
 */
export class SyncPipeline {
  constructor(private readonly deps: SyncPipelineDeps) {}

  async runForItem(
    userId: string,
    plaidItemId: string,
  ): Promise<{ mode: "queued" | "inline"; sync: SyncResult | null }> {
    if (this.deps.queue) {
      // The worker enqueues the detection + alert follow-ups when the sync
      // job completes — one chain, independently retriable stages.
      await this.deps.queue.add(QUEUE_NAMES.plaidSync, { userId, plaidItemId });
      return { mode: "queued", sync: null };
    }

    const sync = await this.deps.syncTransactions.syncItem(plaidItemId);
    await this.deps.detectSubscriptions.runForUser(userId);
    await this.deps.detectBills.runForUser(userId);
    await this.deps.evaluateAlerts.evaluateUser(userId);

    // Advice is enrichment on top of detection: it runs last, and a model
    // failure must never fail a sync that already stored good transactions.
    if (this.deps.refreshAdvice) {
      try {
        await this.deps.refreshAdvice.runForUser(userId);
      } catch {
        // Intentionally swallowed — see above.
      }
    }

    return { mode: "inline", sync };
  }
}

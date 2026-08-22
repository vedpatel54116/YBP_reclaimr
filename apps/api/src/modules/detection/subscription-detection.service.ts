import type { PrismaClient, Transaction } from "@prisma/client";
import {
  detectSubscriptions,
  normalizeMerchant,
  type AlertDraft,
  type DetectedSubscription,
  type DetectionTransaction,
  type MerchantHintTable,
} from "@reclaimr/core";
import { dateOnlyFromDate } from "../accounts/mapper";
import type { AlertService } from "../alerts/alert.service";
import type { MerchantNormalizationService } from "./merchant-normalization.service";

export interface DetectionRunResult {
  /** Series the engine identified (active + stale). */
  detected: number;
  /** New subscription rows created. */
  created: number;
  /** Existing auto-detected rows refreshed. */
  updated: number;
  /** Transactions flagged isRecurring by this run. */
  flagged: number;
  /** Alerts created (new detections + price changes). */
  alertsCreated: number;
}

/** Lookback window for detection input. */
const LOOKBACK_DAYS = 400;

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Subscription detection: run the pure engine over a member's history and
 * reconcile its output with the subscription table. Idempotent by matching
 * on (userId, merchant) for auto-detected rows — re-running never
 * duplicates; it refreshes amounts, cadence, and next-charge predictions.
 */
export class SubscriptionDetectionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly merchants: MerchantNormalizationService,
    private readonly alerts: AlertService,
  ) {}

  async runForUser(userId: string, now: Date = new Date()): Promise<DetectionRunResult> {
    const rows: Array<Transaction & { merchant: { normalizedKey: string } | null }> =
      await this.prisma.transaction.findMany({
        where: {
          userId,
          isPending: false,
          occurredAt: { gte: new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000) },
        },
        include: { merchant: { select: { normalizedKey: true } } },
        orderBy: { occurredAt: "asc" },
      });

    // Resolve every distinct merchant key once; the resolutions double as the
    // engine's hint table (curated names, categories, provider flags).
    const distinctKeys = [
      ...new Set(rows.map((r) => r.merchant?.normalizedKey ?? normalizeMerchant(r.merchantName))),
    ];
    const keyResolutions = await this.merchants.resolveByKeys(distinctKeys);
    const hints: MerchantHintTable = new Map(
      [...keyResolutions.entries()].map(([key, resolution]) => [key, resolution.hints]),
    );

    const coreInput: DetectionTransaction[] = rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt,
      merchantName: row.merchantName,
      amountCents: row.amountCents,
      category: row.category,
    }));
    const detected = detectSubscriptions(coreInput, { now, merchantHints: hints });

    let created = 0;
    let updated = 0;
    const alertDrafts: AlertDraft[] = [];

    for (const series of detected) {
      if (!series.isActive) continue; // zombie series: keep the row, skip refresh
      const merchantId = keyResolutions.get(series.merchantKey)?.merchantId;
      if (!merchantId) continue;

      const existing = await this.prisma.subscription.findFirst({
        where: { userId, merchantId, source: "auto" },
      });

      if (!existing) {
        const subscription = await this.prisma.subscription.create({
          data: {
            userId,
            merchantId,
            name: series.displayName,
            amountCents: series.amountCents,
            cadence: series.cadence,
            status: "active",
            nextBillingDate: dateOnlyFromDate(series.nextChargeAt),
            source: "auto",
            confidence: series.confidence,
            firstDetectedAt: now,
            lastChargedAt: dateOnlyFromDate(series.lastChargeAt),
            priceChangedAt: series.priceChanged ? now : null,
          },
        });
        created += 1;
        alertDrafts.push({
          type: "new_subscription_detected",
          severity: "info",
          title: "New subscription found",
          body: `${series.displayName} — ${formatCents(series.amountCents)} ${series.cadence}.`,
          dedupKey: `new_subscription_detected:${subscription.id}`,
          data: {
            subscriptionId: subscription.id,
            amountCents: series.amountCents,
            confidence: series.confidence,
          },
        });
        if (series.priceChanged && series.previousAmountCents !== null) {
          alertDrafts.push(priceChangeDraft(subscription.id, series));
        }
        continue;
      }

      // Refresh the existing row. A price change is recorded once: when the
      // stored amount still reflects the old level.
      const priceJustChanged =
        series.priceChanged &&
        series.previousAmountCents !== null &&
        existing.amountCents === series.previousAmountCents &&
        !existing.priceChangedAt;

      await this.prisma.subscription.update({
        where: { id: existing.id },
        data: {
          amountCents: series.amountCents,
          cadence: series.cadence,
          nextBillingDate: dateOnlyFromDate(series.nextChargeAt),
          lastChargedAt: dateOnlyFromDate(series.lastChargeAt),
          confidence: series.confidence,
          ...(priceJustChanged ? { priceChangedAt: now } : {}),
          // A member-paused row stays paused; a charge after canceling
          // suggests the cancellation did not take — surface as active.
          ...(existing.status === "active" || existing.status === "cancel_requested"
            ? { status: "active" }
            : {}),
        },
      });
      updated += 1;
      if (priceJustChanged) {
        alertDrafts.push(priceChangeDraft(existing.id, series));
      }
    }

    const flaggedIds = detected.flatMap((series) => series.transactionIds);
    if (flaggedIds.length > 0) {
      await this.prisma.transaction.updateMany({
        where: { id: { in: flaggedIds } },
        data: { isRecurring: true },
      });
    }

    const alertsCreated = await this.alerts.recordMany(userId, alertDrafts);
    return {
      detected: detected.length,
      created,
      updated,
      flagged: flaggedIds.length,
      alertsCreated,
    };
  }
}

function priceChangeDraft(subscriptionId: string, series: DetectedSubscription): AlertDraft {
  return {
    type: "price_increase",
    severity: "warning",
    title: "Subscription price increased",
    body:
      series.previousAmountCents !== null
        ? `${series.displayName} went from ${formatCents(series.previousAmountCents)} to ${formatCents(series.amountCents)}.`
        : `${series.displayName} changed price.`,
    dedupKey: `price_increase:${subscriptionId}:${series.amountCents}`,
    data: {
      subscriptionId,
      previousAmountCents: series.previousAmountCents,
      amountCents: series.amountCents,
    },
  };
}

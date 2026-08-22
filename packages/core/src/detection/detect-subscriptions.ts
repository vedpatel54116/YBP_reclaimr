import { daysBetween, mean, mode, roundMoneyCents, stdev } from "../stats";
import type {
  DetectedSubscription,
  DetectionTransaction,
  MerchantHintTable,
  TransactionCategory,
} from "../types";
import { computeGapStats, matchCadenceBand, predictNextCharge } from "./cadence";
import { BILL_CATEGORIES, findCatalogHints, NON_PURCHASE_CATEGORIES } from "./merchant-catalog";
import { normalizeMerchant, titleCase } from "./normalize-merchant";

export interface DetectSubscriptionsOptions {
  /** Injected clock — never Date.now() inside core. */
  now: Date;
  /** Minimum charges before a series can be called a subscription. */
  minOccurrences?: number;
  /**
   * A series is "active" while its last charge is within this multiple of its
   * cadence (plus a grace window). Inactive series are returned with
   * isActive=false; callers decide whether to surface them.
   */
  recencyCadenceMultiplier?: number;
  recencyGraceDays?: number;
  /** Curated merchant knowledge keyed by normalized merchant key. */
  merchantHints?: MerchantHintTable;
}

const DEFAULTS = {
  minOccurrences: 3,
  recencyCadenceMultiplier: 1.5,
  recencyGraceDays: 10,
  // Confidence formula weights (see scoreConfidence).
  base: 0.45,
  perOccurrence: 0.06,
  maxOccurrenceWeight: 0.48, // caps the count term at 8 occurrences
  regularityWeight: 0.25,
  stabilityWeight: 0.15,
  priceChangeThreshold: 0.08, // >8% level shift flags a price change
};

/** Confidence in [0, 1]: count + interval regularity + amount stability. */
export function scoreConfidence(
  occurrenceCount: number,
  gapStdevDays: number,
  medianGapDays: number,
  amountStdevCents: number,
  meanAmountCents: number,
): number {
  const cappedCount = Math.min(
    occurrenceCount,
    DEFAULTS.maxOccurrenceWeight / DEFAULTS.perOccurrence,
  );
  const countTerm = DEFAULTS.perOccurrence * cappedCount;
  const regularity = 1 - Math.min(1, gapStdevDays / (medianGapDays * 0.35));
  const stability =
    meanAmountCents > 0 ? 1 - Math.min(1, amountStdevCents / (meanAmountCents * 0.25)) : 0;
  const confidence =
    DEFAULTS.base +
    countTerm +
    DEFAULTS.regularityWeight * regularity +
    DEFAULTS.stabilityWeight * stability;
  return roundConfidence(confidence);
}

function roundConfidence(value: number): number {
  return Math.round(Math.min(0.99, Math.max(0, value)) * 1000) / 1000;
}

function isSubscriptionCandidate(txn: DetectionTransaction, hints: MerchantHintTable): boolean {
  if (txn.amountCents <= 0) return false; // only charges
  if (NON_PURCHASE_CATEGORIES.has(txn.category)) return false;
  // Curated providers always qualify (their category may be generic).
  if (hints.get(normalizedKeyOf(txn))?.isSubscriptionProvider) return true;
  // Fixed life admin is modeled as bills, not subscriptions.
  return !BILL_CATEGORIES.has(txn.category);
}

function normalizedKeyOf(txn: DetectionTransaction): string {
  return normalizeMerchant(txn.merchantName);
}

/**
 * Detect recurring discretionary charges (subscriptions) from a transaction
 * history. Pure: same input + same `now` → same output, always.
 */
export function detectSubscriptions(
  transactions: readonly DetectionTransaction[],
  options: DetectSubscriptionsOptions,
): DetectedSubscription[] {
  const {
    now,
    minOccurrences = DEFAULTS.minOccurrences,
    recencyCadenceMultiplier = DEFAULTS.recencyCadenceMultiplier,
    recencyGraceDays = DEFAULTS.recencyGraceDays,
    merchantHints = new Map(),
  } = options;

  const candidates = transactions.filter((txn) => isSubscriptionCandidate(txn, merchantHints));
  const groups = new Map<string, DetectionTransaction[]>();
  for (const txn of candidates) {
    const key = normalizedKeyOf(txn);
    const bucket = groups.get(key);
    if (bucket) bucket.push(txn);
    else groups.set(key, [txn]);
  }

  const detected: DetectedSubscription[] = [];

  for (const [key, txns] of groups) {
    if (txns.length < minOccurrences) continue;
    const sorted = [...txns].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    const stats = computeGapStats(sorted.map((t) => t.occurredAt));
    if (!stats) continue;
    const band = matchCadenceBand(stats);
    if (!band) continue;

    const amounts = sorted.map((t) => t.amountCents);
    const meanAmount = mean(amounts);
    const amountStdev = stdev(amounts);

    const latest = sorted[sorted.length - 1];
    if (!latest) continue;

    // Price-change detection: latest charge vs the prior level (≥2 priors).
    // The *mean* of priors decides whether a shift happened (robust to noise),
    // but the reported previous amount is the prior *mode* — the price the
    // member was actually being charged. Reporting the mean would name a
    // price they never paid once two charges at the new level accumulate, and
    // would break the caller's "is the stored amount still the old level?"
    // check that gates the price-increase alert.
    const priorAmounts = amounts.slice(0, -1);
    const priorMean = priorAmounts.length > 0 ? mean(priorAmounts) : latest.amountCents;
    const priceChanged =
      priorAmounts.length >= 2 &&
      priorMean > 0 &&
      Math.abs(latest.amountCents - priorMean) / priorMean > DEFAULTS.priceChangeThreshold;

    const cadenceDays = Math.round(stats.medianGapDays);
    const cadence = band.cadence;
    const lastChargeAt = latest.occurredAt;
    const nextChargeAt = predictNextCharge(lastChargeAt, stats.medianGapDays);
    const monthlyEquivalentCents = roundMoneyCents(
      (latest.amountCents * 30.4375) / stats.medianGapDays,
    );

    const staleAfterDays = stats.medianGapDays * recencyCadenceMultiplier + recencyGraceDays;
    const isActive = daysBetween(lastChargeAt, now) <= staleAfterDays;

    const hints = merchantHints.get(key);
    const catalog = findCatalogHints(key);
    const category: TransactionCategory = hints?.category ?? catalog?.category ?? latest.category;

    detected.push({
      merchantKey: key,
      displayName: hints?.displayName ?? catalog?.displayName ?? titleCase(key),
      category,
      amountCents: latest.amountCents,
      previousAmountCents: priceChanged ? roundMoneyCents(mode(priorAmounts)) : null,
      priceChanged,
      cadence,
      cadenceDays,
      firstChargeAt: sorted[0]!.occurredAt,
      lastChargeAt,
      nextChargeAt,
      monthlyEquivalentCents,
      confidence: scoreConfidence(
        sorted.length,
        stats.gapStdevDays,
        stats.medianGapDays,
        amountStdev,
        meanAmount,
      ),
      occurrenceCount: sorted.length,
      isActive,
      transactionIds: sorted.map((t) => t.id),
    });
  }

  // Biggest monthly spend first — the order the dashboard surfaces.
  detected.sort((a, b) => b.monthlyEquivalentCents - a.monthlyEquivalentCents);
  return detected;
}

export const SUBSCRIPTION_DETECTION_DEFAULTS = DEFAULTS;

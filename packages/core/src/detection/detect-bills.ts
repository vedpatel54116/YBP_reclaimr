import { daysBetween, mean, median, mode, roundMoneyCents, stdev } from "../stats";
import type {
  DetectedBill,
  DetectionTransaction,
  MerchantHintTable,
  TransactionCategory,
} from "../types";
import { computeGapStats, matchCadenceBand } from "./cadence";
import { BILL_CATEGORIES, findCatalogHints } from "./merchant-catalog";
import { normalizeMerchant, titleCase } from "./normalize-merchant";

export interface DetectBillsOptions {
  /** Injected clock — never Date.now() inside core. */
  now: Date;
  /** Minimum charges before a series can be called a bill. */
  minOccurrences?: number;
  /**
   * Categories treated as bill categories. Defaults to housing, utilities,
   * telecommunications, insurance. Overridable for tests and curation.
   */
  billCategories?: ReadonlySet<TransactionCategory>;
  merchantHints?: MerchantHintTable;
  recencyCadenceMultiplier?: number;
  recencyGraceDays?: number;
}

const DEFAULTS = {
  minOccurrences: 3,
  recencyCadenceMultiplier: 1.5,
  recencyGraceDays: 20, // bills tolerate longer silence than subscriptions
  // Confidence weights. Amount variance is tolerated (utilities vary with the
  // season); the strong signals are interval regularity and a stable due day.
  base: 0.5,
  perOccurrence: 0.06,
  maxOccurrenceWeight: 0.48,
  regularityWeight: 0.25,
  dueDayConsistencyWeight: 0.15,
  stabilityWeight: 0.09,
  stabilityTolerance: 0.6, // amount stdev may be 60% of mean before it costs
  dueDayWindow: 2, // charges within ±2 days of the modal day count as on time
  negotiableCategories: new Set<TransactionCategory>(["telecommunications", "insurance"]),
};

/** Confidence in [0, 1]: count + regularity + due-day consistency + soft amount stability. */
export function scoreBillConfidence(
  occurrenceCount: number,
  gapStdevDays: number,
  medianGapDays: number,
  dueDayConsistency: number,
  amountStdevCents: number,
  meanAmountCents: number,
): number {
  const cappedCount = Math.min(
    occurrenceCount,
    DEFAULTS.maxOccurrenceWeight / DEFAULTS.perOccurrence,
  );
  const regularity = 1 - Math.min(1, gapStdevDays / (medianGapDays * 0.35));
  const stability =
    meanAmountCents > 0
      ? 1 - Math.min(1, amountStdevCents / (meanAmountCents * DEFAULTS.stabilityTolerance))
      : 0;
  const confidence =
    DEFAULTS.base +
    DEFAULTS.perOccurrence * cappedCount +
    DEFAULTS.regularityWeight * regularity +
    DEFAULTS.dueDayConsistencyWeight * dueDayConsistency +
    DEFAULTS.stabilityWeight * stability;
  return Math.round(Math.min(0.99, Math.max(0, confidence)) * 1000) / 1000;
}

/**
 * Detect recurring bills — fixed life admin (utilities, telecom, insurance,
 * housing) — and separate them from subscriptions. Variable amounts are
 * expected here: the engine reports a median-based expectation instead of
 * requiring a stable amount.
 */
export function detectBills(
  transactions: readonly DetectionTransaction[],
  options: DetectBillsOptions,
): DetectedBill[] {
  const {
    now,
    minOccurrences = DEFAULTS.minOccurrences,
    billCategories = BILL_CATEGORIES,
    merchantHints = new Map(),
    recencyCadenceMultiplier = DEFAULTS.recencyCadenceMultiplier,
    recencyGraceDays = DEFAULTS.recencyGraceDays,
  } = options;

  const groups = new Map<string, DetectionTransaction[]>();
  for (const txn of transactions) {
    if (txn.amountCents <= 0) continue; // only charges
    if (!billCategories.has(txn.category)) continue;
    const key = normalizeMerchant(txn.merchantName);
    const bucket = groups.get(key);
    if (bucket) bucket.push(txn);
    else groups.set(key, [txn]);
  }

  const detected: DetectedBill[] = [];

  for (const [key, txns] of groups) {
    if (txns.length < minOccurrences) continue;
    const sorted = [...txns].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    const stats = computeGapStats(sorted.map((t) => t.occurredAt));
    if (!stats) continue;
    const band = matchCadenceBand(stats);
    if (!band) continue;

    const latest = sorted[sorted.length - 1];
    if (!latest) continue;

    // Due-day analysis: the modal calendar day, and how consistently charges
    // land within a small window of it (banks shift weekender charges).
    const chargeDays = sorted.map((t) => t.occurredAt.getUTCDate());
    const dueDay = mode(chargeDays);
    const onTime = chargeDays.filter((d) => Math.abs(d - dueDay) <= DEFAULTS.dueDayWindow).length;
    const dueDayConsistency = onTime / sorted.length;

    const amounts = sorted.map((t) => t.amountCents);
    const hints = merchantHints.get(key);
    const catalog = findCatalogHints(key);
    const category: TransactionCategory = hints?.category ?? catalog?.category ?? latest.category;

    const staleAfterDays = stats.medianGapDays * recencyCadenceMultiplier + recencyGraceDays;
    const isActive = daysBetween(latest.occurredAt, now) <= staleAfterDays;

    detected.push({
      merchantKey: key,
      displayName: hints?.displayName ?? catalog?.displayName ?? titleCase(key),
      category,
      cadence: band.cadence,
      cadenceDays: Math.round(stats.medianGapDays),
      lastAmountCents: latest.amountCents,
      expectedAmountCents: roundMoneyCents(median(amounts)),
      dueDay,
      confidence: scoreBillConfidence(
        sorted.length,
        stats.gapStdevDays,
        stats.medianGapDays,
        dueDayConsistency,
        stdev(amounts),
        mean(amounts),
      ),
      occurrenceCount: sorted.length,
      isActive,
      negotiable:
        hints?.negotiable ?? catalog?.negotiable ?? DEFAULTS.negotiableCategories.has(category),
      lastChargeAt: latest.occurredAt,
      firstChargeAt: sorted[0]!.occurredAt,
      transactionIds: sorted.map((t) => t.id),
    });
  }

  detected.sort((a, b) => b.expectedAmountCents - a.expectedAmountCents);
  return detected;
}

export const BILL_DETECTION_DEFAULTS = DEFAULTS;

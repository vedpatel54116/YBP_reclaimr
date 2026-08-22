import { daysBetween, median, stdev } from "../stats";
import type { BillingCadence } from "../types";

/**
 * Cadence bands with tolerances. A charge series matches a band when its
 * median gap lands inside `days ± tolerance` AND the gap standard deviation
 * is small relative to the band (jitter under 35% of the interval).
 */
export interface CadenceBand {
  cadence: BillingCadence;
  days: number;
  toleranceDays: number;
}

export const CADENCE_BANDS: readonly CadenceBand[] = [
  { cadence: "weekly", days: 7, toleranceDays: 1 },
  { cadence: "biweekly", days: 14, toleranceDays: 1.5 },
  { cadence: "monthly", days: 30.4375, toleranceDays: 2.6 },
  { cadence: "quarterly", days: 91.3125, toleranceDays: 8 },
  { cadence: "annual", days: 365.25, toleranceDays: 14 },
];

const MAX_GAP_JITTER_RATIO = 0.35;

export interface GapStats {
  medianGapDays: number;
  gapStdevDays: number;
}

/** Gaps between consecutive charge dates, in days. Null needs ≥ 2 dates. */
export function computeGapStats(dates: Date[]): GapStats | null {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev && curr) gaps.push(daysBetween(prev, curr));
  }
  if (gaps.length === 0) return null;
  return { medianGapDays: median(gaps), gapStdevDays: stdev(gaps) };
}

/** The band a gap distribution fits, or null when the series is irregular. */
export function matchCadenceBand(stats: GapStats): CadenceBand | null {
  for (const band of CADENCE_BANDS) {
    const withinTolerance = Math.abs(stats.medianGapDays - band.days) <= band.toleranceDays;
    const jitterOk = stats.gapStdevDays <= band.days * MAX_GAP_JITTER_RATIO;
    if (withinTolerance && jitterOk) return band;
  }
  return null;
}

/** Predict the next charge date: last observed charge plus the median gap. */
export function predictNextCharge(lastCharge: Date, medianGapDays: number): Date {
  return new Date(lastCharge.getTime() + Math.round(medianGapDays) * 86_400_000);
}

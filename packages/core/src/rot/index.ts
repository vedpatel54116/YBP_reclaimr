/**
 * Subscription Rot Score Engine.
 *
 * Models the diminishing-returns value curve of recurring subscriptions based
 * on monthly screen time / usage hours (S) and monthly price (P):
 *
 *   R(S, P) = P * (1 - u^a)   where   u = min(max(S / S_cap, 0), 1)
 *
 * By default:
 *   - S_cap = 20 hours/month (full value benchmark usage)
 *   - a = 0.5 (square-root curve: using 2 hours captures significant value
 *              early on, with diminishing incremental returns past 15-20 hrs).
 *
 * Pure domain logic: zero dependencies, zero side effects, fully deterministic.
 */

export const DEFAULT_BENCHMARK_HOURS = 20;
export const DEFAULT_SHAPE_EXPONENT = 0.5;

export type RotTier = "healthy" | "moderate_rot" | "high_rot";

export interface RotCalculationInput {
  /** Screen time / usage logged this month in hours (S >= 0). */
  hoursUsedMonth: number;
  /** Monthly equivalent price of subscription in cents (P >= 0). */
  monthlyPriceCents: number;
  /** Benchmark hours per month considered 'full value' usage (S_cap > 0, defaults to 20). */
  benchmarkHoursMonth?: number;
  /** Curvature exponent for diminishing returns (a > 0, defaults to 0.5 for square root). */
  shapeExponent?: number;
}

export interface RotScoreResult {
  /** Integer score from 0 (healthy / 0% rot) to 100 (pure waste / 100% rot). */
  rotScore: number;
  /** Fractional rot ratio in [0, 1]. */
  rotRatio: number;
  /** Fractional utilization ratio in [0, 1] = min(hoursUsedMonth / benchmarkHoursMonth, 1). */
  utilizationRatio: number;
  /** Effective monthly money wasted in cents = Math.round(monthlyPriceCents * rotRatio). */
  wastedMonthlyCents: number;
  /** Effective monthly value captured in cents = monthlyPriceCents - wastedMonthlyCents. */
  capturedValueMonthlyCents: number;
  /** Effective cost per hour used in cents, or null if hoursUsedMonth is 0. */
  costPerHourUsedCents: number | null;
  /** Classification tier: 'healthy' (< 30), 'moderate_rot' (30-69), 'high_rot' (>= 70). */
  tier: RotTier;
  /** Human-readable tier label. */
  tierLabel: string;
  /** Diagnostic breakdown values. */
  hoursUsedMonth: number;
  benchmarkHoursMonth: number;
  monthlyPriceCents: number;
  shapeExponent: number;
}

export interface RotPortfolioSummary {
  /** Total monthly cost across analyzed subscriptions in cents. */
  totalMonthlyCents: number;
  /** Total estimated monthly wasted dollars across all analyzed subscriptions in cents. */
  totalWastedMonthlyCents: number;
  /** Total captured value across subscriptions in cents. */
  totalCapturedValueMonthlyCents: number;
  /** Weighted average rot score (weighted by monthly price) or arithmetic mean if total is 0. */
  averageRotScore: number;
  /** Count of subscriptions with high rot (>= 70). */
  highRotCount: number;
  /** Count of subscriptions with moderate rot (30-69). */
  moderateRotCount: number;
  /** Count of subscriptions with healthy utilization (< 30). */
  healthyCount: number;
}

/** Determines tier and human-readable label from integer rot score. */
export function getRotTier(rotScore: number): { tier: RotTier; label: string } {
  if (rotScore >= 60) {
    return { tier: "high_rot", label: "High Rot" };
  }
  if (rotScore >= 30) {
    return { tier: "moderate_rot", label: "Moderate Rot" };
  }
  return { tier: "healthy", label: "Healthy" };
}

/**
 * Computes the Rot Score and wasted money for a single subscription.
 */
export function computeRotScore(input: RotCalculationInput): RotScoreResult {
  const hoursUsed = Math.max(0, Number.isFinite(input.hoursUsedMonth) ? input.hoursUsedMonth : 0);
  const priceCents = Math.max(
    0,
    Number.isFinite(input.monthlyPriceCents) ? input.monthlyPriceCents : 0,
  );
  const benchmarkHours =
    input.benchmarkHoursMonth && input.benchmarkHoursMonth > 0
      ? input.benchmarkHoursMonth
      : DEFAULT_BENCHMARK_HOURS;
  const exponent =
    input.shapeExponent && input.shapeExponent > 0
      ? input.shapeExponent
      : DEFAULT_SHAPE_EXPONENT;

  // Normalized utilization u = min(S / S_cap, 1)
  const utilizationRatio = Math.min(1, hoursUsed / benchmarkHours);

  // Diminishing returns curve: Value ratio = u^a, Rot ratio = 1 - u^a
  const valueRatio = Math.pow(utilizationRatio, exponent);
  const rotRatio = Math.max(0, Math.min(1, 1 - valueRatio));

  const rotScore = Math.round(rotRatio * 100);
  const wastedMonthlyCents = Math.round(priceCents * rotRatio);
  const capturedValueMonthlyCents = Math.max(0, priceCents - wastedMonthlyCents);

  const costPerHourUsedCents =
    hoursUsed > 0 ? Math.round(priceCents / hoursUsed) : null;

  const { tier, label: tierLabel } = getRotTier(rotScore);

  return {
    rotScore,
    rotRatio,
    utilizationRatio,
    wastedMonthlyCents,
    capturedValueMonthlyCents,
    costPerHourUsedCents,
    tier,
    tierLabel,
    hoursUsedMonth: hoursUsed,
    benchmarkHoursMonth: benchmarkHours,
    monthlyPriceCents: priceCents,
    shapeExponent: exponent,
  };
}

/**
 * Summarizes the rot metrics across a portfolio of subscriptions.
 */
export function summarizeRotPortfolio(items: RotCalculationInput[]): RotPortfolioSummary {
  if (items.length === 0) {
    return {
      totalMonthlyCents: 0,
      totalWastedMonthlyCents: 0,
      totalCapturedValueMonthlyCents: 0,
      averageRotScore: 0,
      highRotCount: 0,
      moderateRotCount: 0,
      healthyCount: 0,
    };
  }

  let totalMonthlyCents = 0;
  let totalWastedMonthlyCents = 0;
  let totalCapturedValueMonthlyCents = 0;
  let weightedScoreSum = 0;
  let highRotCount = 0;
  let moderateRotCount = 0;
  let healthyCount = 0;

  for (const item of items) {
    const result = computeRotScore(item);
    totalMonthlyCents += result.monthlyPriceCents;
    totalWastedMonthlyCents += result.wastedMonthlyCents;
    totalCapturedValueMonthlyCents += result.capturedValueMonthlyCents;
    weightedScoreSum += result.rotScore * result.monthlyPriceCents;

    if (result.tier === "high_rot") highRotCount += 1;
    else if (result.tier === "moderate_rot") moderateRotCount += 1;
    else healthyCount += 1;
  }

  const averageRotScore =
    totalMonthlyCents > 0
      ? Math.round(weightedScoreSum / totalMonthlyCents)
      : Math.round(
          items.reduce((sum, item) => sum + computeRotScore(item).rotScore, 0) /
            items.length,
        );

  return {
    totalMonthlyCents,
    totalWastedMonthlyCents,
    totalCapturedValueMonthlyCents,
    averageRotScore,
    highRotCount,
    moderateRotCount,
    healthyCount,
  };
}

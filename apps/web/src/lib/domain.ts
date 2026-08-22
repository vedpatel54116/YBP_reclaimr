import type { BillingCadence, Subscription, SubscriptionStatus } from "@reclaimr/shared";
import {
  computeRotScore,
  getRotTier,
  summarizeRotPortfolio,
  type RotCalculationInput,
  type RotPortfolioSummary,
  type RotScoreResult,
  type RotTier,
} from "@reclaimr/core";

/*
 * Dashboard domain models for the surfaces the API does not serve yet
 * (bills, alerts, savings, premium). Shapes deliberately mirror the Prisma
 * schema in apps/api so these become wire types verbatim when the endpoints
 * land. Until then the pages read them from typed demo fixtures.
 */

export type BillCategory =
  "utilities" | "telecommunications" | "insurance" | "housing" | "fitness" | "other";

export interface Bill {
  id: string;
  name: string;
  category: BillCategory;
  /** Last observed charge; the number the table shows. */
  lastAmountCents: number;
  expectedAmountCents: number;
  /** Day of month (1–31) the bill is due. */
  dueDay: number;
  cadence: BillingCadence;
  autopay: boolean;
  /** Whether concierge negotiation is offered for this bill. */
  negotiable: boolean;
  /** Concierge's estimated first-year savings, when negotiable. */
  projectedAnnualSavingsCents?: number;
  /** Mask of the account the bill charges, display only. */
  accountMask: string;
}

export type AlertType =
  | "price_increase"
  | "new_subscription_detected"
  | "upcoming_bill"
  | "low_balance"
  | "subscription_canceled"
  | "large_purchase"
  | "bank_connection_error";

export interface AlertItem {
  id: string;
  type: AlertType;
  severity: "info" | "warning";
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export type SavingsKind = "subscription_canceled" | "bill_negotiated" | "fee_refunded";

export interface SavingsEvent {
  id: string;
  kind: SavingsKind;
  amountCents: number;
  description: string;
  /** Date-only ISO string. */
  occurredAt: string;
}

// ─── Derived money math ──────────────────────────────────────────────────────

const PERIODS_PER_YEAR: Record<BillingCadence, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  annual: 1,
};

/** Normalizes any cadence to its monthly-equivalent cents (rounded). */
export function monthlyEquivalentCents(amountCents: number, cadence: BillingCadence): number {
  return Math.round((amountCents * PERIODS_PER_YEAR[cadence]) / 12);
}

/** One billing period in days, used to derive past charges from the next one. */
const PERIOD_DAYS: Record<BillingCadence, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  annual: 365,
};

/**
 * Derives the previous charge date from the next billing date by stepping back
 * one period. The API wire contract carries only `nextBillingDate`, so "last
 * charge" is computed rather than stored.
 */
export function previousChargeDate(nextBillingDate: string, cadence: BillingCadence): string {
  const date = new Date(`${nextBillingDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - PERIOD_DAYS[cadence]);
  return date.toISOString().slice(0, 10);
}

/** Upcoming charge dates after `nextBillingDate`, oldest first. */
export function upcomingChargeDates(
  nextBillingDate: string,
  cadence: BillingCadence,
  count: number,
): string[] {
  const dates: string[] = [];
  const date = new Date(`${nextBillingDate}T00:00:00Z`);
  for (let index = 0; index < count; index += 1) {
    date.setUTCDate(date.getUTCDate() + PERIOD_DAYS[cadence]);
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

/** Past charge dates before `nextBillingDate`, newest first. */
export function recentChargeDates(
  nextBillingDate: string,
  cadence: BillingCadence,
  count: number,
): string[] {
  const dates: string[] = [];
  let date = `${nextBillingDate}T00:00:00Z`;
  for (let index = 0; index < count; index += 1) {
    const previous = new Date(date);
    previous.setUTCDate(previous.getUTCDate() - PERIOD_DAYS[cadence]);
    const iso = previous.toISOString().slice(0, 10);
    dates.push(iso);
    date = `${iso}T00:00:00Z`;
  }
  return dates;
}

/** Next calendar occurrence of a monthly due day (clipped for short months). */
export function nextDueDate(dueDay: number, now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const clamp = (year: number, month: number) =>
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).getTime();

  const candidateDay = Math.min(dueDay, clamp(year, month));
  const thisMonth = new Date(Date.UTC(year, month, candidateDay));
  if (thisMonth.getTime() >= todayUtc) return thisMonth.toISOString().slice(0, 10);

  const nextMonthYear = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextDay = Math.min(dueDay, clamp(nextMonthYear, nextMonth));
  return new Date(Date.UTC(nextMonthYear, nextMonth, nextDay)).toISOString().slice(0, 10);
}

// ─── Subscription aggregations ───────────────────────────────────────────────

export interface SubscriptionSummary {
  /** Sum of monthly-equivalent spend across active subscriptions. */
  totalMonthlyCents: number;
  /** Same, expressed per year. */
  totalYearlyCents: number;
  activeCount: number;
  pausedCount: number;
  cancelRequestedCount: number;
  canceledCount: number;
}

export function summarizeSubscriptions(subscriptions: Subscription[]): SubscriptionSummary {
  const summary: SubscriptionSummary = {
    totalMonthlyCents: 0,
    totalYearlyCents: 0,
    activeCount: 0,
    pausedCount: 0,
    cancelRequestedCount: 0,
    canceledCount: 0,
  };
  for (const subscription of subscriptions) {
    if (subscription.status === "active") summary.activeCount += 1;
    else if (subscription.status === "paused") summary.pausedCount += 1;
    else if (subscription.status === "cancel_requested") summary.cancelRequestedCount += 1;
    else summary.canceledCount += 1;
    if (subscription.status === "active") {
      const monthly = monthlyEquivalentCents(subscription.amountCents, subscription.cadence);
      summary.totalMonthlyCents += monthly;
    }
  }
  summary.totalYearlyCents = summary.totalMonthlyCents * 12;
  return summary;
}

export const STATUS_FILTERS = ["all", "active", "paused", "cancel_requested", "canceled"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export function isStatusFilter(value: string | undefined): value is StatusFilter {
  return value !== undefined && (STATUS_FILTERS as readonly string[]).includes(value);
}

const STATUS_BADGE_VARIANT: Record<SubscriptionStatus, "solid" | "outline" | "muted"> = {
  active: "solid",
  paused: "outline",
  cancel_requested: "outline",
  canceled: "muted",
};

export function statusBadgeVariant(status: SubscriptionStatus) {
  return STATUS_BADGE_VARIANT[status];
}

// ─── Rot Score helpers ───────────────────────────────────────────────────────

export { getRotTier, summarizeRotPortfolio };
export type { RotCalculationInput, RotPortfolioSummary, RotScoreResult, RotTier };

const ROT_BADGE_VARIANT: Record<RotTier, "solid" | "outline" | "muted"> = {
  high_rot: "solid",
  moderate_rot: "outline",
  healthy: "muted",
};

export function rotBadgeVariant(tier: RotTier): "solid" | "outline" | "muted" {
  return ROT_BADGE_VARIANT[tier];
}

/**
 * Calculates the Rot Score for a subscription given its cost and usage data.
 */
export function calculateSubscriptionRot(
  subscription: { amountCents: number; cadence: BillingCadence },
  usage?: { hoursUsedMonth: number; benchmarkHoursMonth: number; shapeExponent?: number },
): RotScoreResult {
  const monthlyPriceCents = monthlyEquivalentCents(
    subscription.amountCents,
    subscription.cadence,
  );
  return computeRotScore({
    hoursUsedMonth: usage?.hoursUsedMonth ?? 0,
    monthlyPriceCents,
    benchmarkHoursMonth: usage?.benchmarkHoursMonth,
    shapeExponent: usage?.shapeExponent,
  });
}

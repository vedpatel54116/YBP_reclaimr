import { alternativeAdviceContentSchema, type AlternativeAdviceContent, type Subscription } from "@reclaimr/shared";
import { fetchSubscription, fetchSubscriptions, fetchSubscriptionSuggestions } from "./api";
import {
  DEMO_ALERTS,
  DEMO_BILLS,
  DEMO_SAVINGS_EVENTS,
  DEMO_SUBSCRIPTIONS,
  DEMO_SUGGESTIONS,
  getDemoSubscriptionUsage,
  type SubscriptionUsageRecord,
} from "./demo";
import {
  calculateSubscriptionRot,
  monthlyEquivalentCents,
  summarizeRotPortfolio,
  type AlertItem,
  type Bill,
  type RotPortfolioSummary,
  type RotScoreResult,
  type SavingsEvent,
} from "./domain";

/**
 * Data access for dashboard pages. Subscriptions come from the live API and
 * fall back to demo fixtures when it is unreachable (dev without the API
 * running, expired session, ...). Bills, alerts, and savings are fixture-only
 * until their endpoints land — pages show the same UI either way and flag
 * demo-sourced subscriptions via `source`.
 */

export type DataSource = "live" | "demo";

export interface SubscriptionListResult {
  subscriptions: Subscription[];
  source: DataSource;
}

export async function loadSubscriptions(): Promise<SubscriptionListResult> {
  const page = await fetchSubscriptions();
  if (page && page.data.length > 0) return { subscriptions: page.data, source: "live" };
  // A reachable API with an empty account is a real empty state; an
  // unreachable one falls back to fixtures so the demo still works.
  if (page && page.total === 0) return { subscriptions: [], source: "live" };
  return { subscriptions: DEMO_SUBSCRIPTIONS, source: "demo" };
}

export interface SubscriptionResult {
  subscription: Subscription;
  source: DataSource;
}

export async function loadSubscription(id: string): Promise<SubscriptionResult | null> {
  const subscription = await fetchSubscription(id);
  if (subscription) return { subscription, source: "live" };
  const demo = DEMO_SUBSCRIPTIONS.find((item) => item.id === id);
  return demo ? { subscription: demo, source: "demo" } : null;
}

export interface AdviceResult {
  content: AlternativeAdviceContent;
  source: DataSource;
}

/**
 * Loads alternative advice for one subscription.
 *
 * A reachable API with no cached advice is a real "nothing to suggest" state and
 * returns null; only an unreachable API falls back to fixtures. Content is
 * schema-validated because it is stored as free-form JSON.
 */
export async function loadAdvice(subscriptionId: string): Promise<AdviceResult | null> {
  const suggestion = await fetchSubscriptionSuggestions(subscriptionId);

  if (suggestion !== undefined) {
    if (!suggestion) return null;
    const parsed = alternativeAdviceContentSchema.safeParse(suggestion.content);
    return parsed.success ? { content: parsed.data, source: "live" } : null;
  }

  const demo = DEMO_SUGGESTIONS[subscriptionId];
  return demo ? { content: demo, source: "demo" } : null;
}

/** Best available monthly saving per subscription id, for list-row badges. */
export function getDemoAdviceSavings(): Map<string, number> {
  const savings = new Map<string, number>();
  for (const [subscriptionId, content] of Object.entries(DEMO_SUGGESTIONS)) {
    const best = Math.max(...content.picks.map((pick) => pick.monthlySavingsCents), 0);
    if (best > 0) savings.set(subscriptionId, best);
  }
  return savings;
}

/**
 * Loads usage record for a subscription (demo-backed until live telemetry API).
 */
export async function loadSubscriptionUsage(
  subscriptionId: string,
): Promise<SubscriptionUsageRecord> {
  return getDemoSubscriptionUsage(subscriptionId);
}

/**
 * Returns computed Rot Score results for a list of subscriptions.
 */
export function getSubscriptionRotScores(
  subscriptions: Subscription[],
): Map<string, RotScoreResult> {
  const map = new Map<string, RotScoreResult>();
  for (const sub of subscriptions) {
    const usage = getDemoSubscriptionUsage(sub.id);
    const rot = calculateSubscriptionRot(sub, usage);
    map.set(sub.id, rot);
  }
  return map;
}

/**
 * Summarizes rot metrics across all active subscriptions.
 */
export function getPortfolioRotSummary(
  subscriptions: Subscription[],
): RotPortfolioSummary {
  const active = subscriptions.filter((s) => s.status === "active");
  const inputs = active.map((s) => {
    const usage = getDemoSubscriptionUsage(s.id);
    return {
      hoursUsedMonth: usage.hoursUsedMonth,
      monthlyPriceCents: monthlyEquivalentCents(s.amountCents, s.cadence),
      benchmarkHoursMonth: usage.benchmarkHoursMonth,
      shapeExponent: usage.shapeExponent,
    };
  });
  return summarizeRotPortfolio(inputs);
}

export function getBills(): Bill[] {
  return DEMO_BILLS;
}

export function getBill(id: string): Bill | undefined {
  return DEMO_BILLS.find((bill) => bill.id === id);
}

export function getAlerts(): AlertItem[] {
  return [...DEMO_ALERTS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function getSavingsEvents(): SavingsEvent[] {
  return [...DEMO_SAVINGS_EVENTS].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}

export interface SavingsSummary {
  /** Everything reclaimed to date, all kinds. */
  totalSavedCents: number;
  /** Monthly run-rate: recurring savings from cancellations + negotiations. */
  monthlyRunRateCents: number;
  /** Run-rate projected over the next twelve months. */
  yearlyProjectedCents: number;
  count: number;
}

export function getSavingsSummary(events: SavingsEvent[]): SavingsSummary {
  let totalSavedCents = 0;
  let firstYearCents = 0;
  for (const event of events) {
    totalSavedCents += event.amountCents;
    if (event.kind !== "fee_refunded") firstYearCents += event.amountCents;
  }
  return {
    totalSavedCents,
    monthlyRunRateCents: Math.round(firstYearCents / 12),
    yearlyProjectedCents: Math.round((firstYearCents / 12) * 12),
    count: events.length,
  };
}

/**
 * Potential monthly savings: the monthly cost of subscriptions detection
 * flags as unused, plus the concierge's projected first-year savings on
 * negotiable bills expressed per month.
 */
export function getPotentialMonthlySavingsCents(
  subscriptions: Subscription[],
  unusedIds: Record<string, string>,
  bills: Bill[],
): number {
  const unused = subscriptions
    .filter((subscription) => subscription.status === "active" && unusedIds[subscription.id])
    .reduce(
      (sum, subscription) =>
        sum + monthlyEquivalentCents(subscription.amountCents, subscription.cadence),
      0,
    );
  const negotiation = bills.reduce(
    (sum, bill) =>
      sum + (bill.negotiable ? Math.round((bill.projectedAnnualSavingsCents ?? 0) / 12) : 0),
    0,
  );
  return unused + negotiation;
}

import type { AlternativeAdviceContent, Subscription } from "@reclaimr/shared";
import type { AlertItem, Bill, SavingsEvent } from "./domain";

/*
 * Typed demo fixtures for dashboard surfaces the API does not serve yet
 * (bills, alerts, savings) and for subscription fallback when the API is
 * unreachable. Dates are computed relative to "now" so the demo always looks
 * alive. Shapes match the Prisma schema / wire contracts, so swapping the
 * fixture for a real fetch is a one-line change at the call site.
 */

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoDaysAgo(days: number, hours = 0): string {
  const date = new Date();
  date.setUTCHours(hours, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

/** Stable fake UUIDs so detail-page links survive re-renders. */
function uuid(seed: string): string {
  const hex = [...seed].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
  const pad = (value: number, length: number) => value.toString(16).padStart(length, "0");
  return [
    pad(hex % 0xffffffff, 8),
    pad((hex >>> 4) % 0xffff, 4),
    `4${pad((hex >>> 8) % 0xfff, 3)}`,
    "8" + pad((hex >>> 12) % 0xfff, 3),
    pad((hex >>> 16) % 0xffffffff, 12),
  ].join("-");
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

function demoSubscription(
  seed: string,
  name: string,
  amountCents: number,
  cadence: Subscription["cadence"],
  status: Subscription["status"],
  nextInDays: number,
): Subscription {
  const isCanceled = status === "canceled";
  return {
    id: uuid(seed),
    merchantId: null,
    name,
    amountCents,
    currency: "USD",
    cadence,
    status,
    nextBillingDate: isoDaysFromNow(nextInDays),
    source: "auto",
    confidence: 0.99,
    firstDetectedAt: isoDaysAgo(400),
    lastChargedAt: isoDaysFromNow(nextInDays - 30),
    // Fixture for the price-hike alert demo on the alerts page.
    priceChangedAt: name === "Design Suite Pro" ? isoDaysAgo(10) : null,
    canceledAt: isCanceled ? isoDaysAgo(5) : null,
    createdAt: isoDaysAgo(400),
    updatedAt: isoDaysAgo(isCanceled ? 5 : 30),
  };
}

export const DEMO_SUBSCRIPTIONS: Subscription[] = [
  demoSubscription("streaming", "Streaming Plus", 1599, "monthly", "active", 6),
  demoSubscription("music", "Music Family Plan", 1699, "monthly", "active", 11),
  demoSubscription("cloud", "Cloud Storage 2TB", 999, "monthly", "active", 2),
  demoSubscription("design", "Design Suite Pro", 5499, "monthly", "active", 18),
  demoSubscription("mealkit", "Meal Kit Weekly", 4900, "weekly", "active", 3),
  demoSubscription("news", "News Daily", 2500, "quarterly", "paused", 34),
  demoSubscription("fitness", "Fitness Club", 4500, "annual", "active", 120),
  demoSubscription("domain", "Domain Renewal", 1799, "annual", "canceled", 300),
];

/**
 * Subscriptions flagged by detection as no longer used — they feed the
 * "potential savings" number until the API exposes a usage signal.
 */
export const UNUSED_SUBSCRIPTION_IDS: Record<string, string> = {
  [uuid("mealkit")]: "No charges matched a delivery in 8 weeks",
  [uuid("fitness")]: "No check-ins since March",
};

export interface SubscriptionUsageRecord {
  hoursUsedMonth: number;
  benchmarkHoursMonth: number;
  shapeExponent?: number;
  lastUsedAt?: string | null;
  notes?: string;
}

/**
 * Demo usage metrics for subscriptions to compute the non-linear Rot Score:
 * R(S, P) = P * (1 - sqrt(S / S_cap)).
 */
export const DEMO_SUBSCRIPTION_USAGE: Record<string, SubscriptionUsageRecord> = {
  [uuid("streaming")]: {
    hoursUsedMonth: 3.5,
    benchmarkHoursMonth: 20,
    lastUsedAt: isoDaysAgo(4),
    notes: "3.5 hrs streamed this month across 2 devices",
  },
  [uuid("music")]: {
    hoursUsedMonth: 22,
    benchmarkHoursMonth: 25,
    lastUsedAt: isoDaysAgo(1),
    notes: "22 hrs listened this month (heavy active listener)",
  },
  [uuid("cloud")]: {
    hoursUsedMonth: 1.0,
    benchmarkHoursMonth: 10,
    lastUsedAt: isoDaysAgo(14),
    notes: "1 hr file access this month (mostly dormant backups)",
  },
  [uuid("design")]: {
    hoursUsedMonth: 4.0,
    benchmarkHoursMonth: 30,
    lastUsedAt: isoDaysAgo(9),
    notes: "4 hrs active editing this month (used for 1 project)",
  },
  [uuid("mealkit")]: {
    hoursUsedMonth: 0,
    benchmarkHoursMonth: 15,
    lastUsedAt: null,
    notes: "0 meals cooked in 8 weeks",
  },
  [uuid("news")]: {
    hoursUsedMonth: 0.5,
    benchmarkHoursMonth: 15,
    lastUsedAt: isoDaysAgo(18),
    notes: "30 mins read this month",
  },
  [uuid("fitness")]: {
    hoursUsedMonth: 0,
    benchmarkHoursMonth: 12,
    lastUsedAt: null,
    notes: "0 check-ins recorded since March",
  },
  [uuid("domain")]: {
    hoursUsedMonth: 0,
    benchmarkHoursMonth: 5,
    lastUsedAt: null,
    notes: "Canceled domain service",
  },
};

export function getDemoSubscriptionUsage(subscriptionId: string): SubscriptionUsageRecord {
  return (
    DEMO_SUBSCRIPTION_USAGE[subscriptionId] ?? {
      hoursUsedMonth: 0,
      benchmarkHoursMonth: 20,
      notes: "No usage activity detected this month",
    }
  );
}

// ─── Alternative advice ──────────────────────────────────────────────────────

/** Cadence-normalized monthly cost. Duplicated from @reclaimr/core rather than
 *  imported so this fixture module stays dependency-free. */
function monthlyCents(amountCents: number, cadence: Subscription["cadence"]): number {
  const days: Record<Subscription["cadence"], number> = {
    weekly: 7,
    biweekly: 14,
    monthly: 30.4375,
    quarterly: 91.3125,
    annual: 365.25,
  };
  return Math.round((amountCents * 30.4375) / days[cadence]);
}

interface DemoAlternative {
  name: string;
  monthlyPriceCents: number;
  rationale: string;
}

/** Builds advice with the same server-side savings math the API uses, so the
 *  demo and the live path can never disagree about a number. */
function demoAdvice(seed: string, alternatives: DemoAlternative[]): AlternativeAdviceContent {
  const subscription = DEMO_SUBSCRIPTIONS.find((item) => item.id === uuid(seed))!;
  const memberMonthly = monthlyCents(subscription.amountCents, subscription.cadence);

  return {
    picks: alternatives.map((alternative) => ({
      optionId: null,
      name: alternative.name,
      monthlyPriceCents: alternative.monthlyPriceCents,
      monthlySavingsCents: memberMonthly - alternative.monthlyPriceCents,
      rationale: alternative.rationale,
    })),
    verdict: `Cheaper plans cover the same need as ${subscription.name}.`,
  };
}

/** Demo alternative advice, keyed by subscription id like the API's cache. */
export const DEMO_SUGGESTIONS: Record<string, AlternativeAdviceContent> = {
  [uuid("streaming")]: demoAdvice("streaming", [
    {
      name: "StreamLite Basic",
      monthlyPriceCents: 799,
      rationale: "Same core catalog on two screens; you lose 4K and gain $8 a month.",
    },
    {
      name: "AdView Plus",
      monthlyPriceCents: 599,
      rationale: "Cheapest ad-supported tier if you mostly watch one show at a time.",
    },
  ]),
  [uuid("music")]: demoAdvice("music", [
    {
      name: "TunePass Solo",
      monthlyPriceCents: 1099,
      rationale: "Identical catalog; the family plan only pays off with three listeners.",
    },
  ]),
  [uuid("fitness")]: demoAdvice("fitness", [
    {
      name: "HomeFit App",
      monthlyPriceCents: 1299,
      rationale: "Guided workouts with no contract — worth it given no check-ins since March.",
    },
  ]),
};

// ─── Bills ───────────────────────────────────────────────────────────────────

export const DEMO_BILLS: Bill[] = [
  {
    id: uuid("fibernet"),
    name: "Fibernet Internet",
    category: "telecommunications",
    lastAmountCents: 8999,
    expectedAmountCents: 8999,
    dueDay: 5,
    cadence: "monthly",
    autopay: true,
    negotiable: true,
    projectedAnnualSavingsCents: 18000,
    accountMask: "4402",
  },
  {
    id: uuid("metro-power"),
    name: "Metro Power & Light",
    category: "utilities",
    lastAmountCents: 16420,
    expectedAmountCents: 15200,
    dueDay: 12,
    cadence: "monthly",
    autopay: false,
    negotiable: false,
    accountMask: "4402",
  },
  {
    id: uuid("cellular"),
    name: "Cellular One",
    category: "telecommunications",
    lastAmountCents: 8500,
    expectedAmountCents: 8500,
    dueDay: 22,
    cadence: "monthly",
    autopay: true,
    negotiable: true,
    projectedAnnualSavingsCents: 9600,
    accountMask: "7719",
  },
  {
    id: uuid("sentinel"),
    name: "Sentinel Home Insurance",
    category: "insurance",
    lastAmountCents: 13100,
    expectedAmountCents: 13100,
    dueDay: 8,
    cadence: "quarterly",
    autopay: false,
    negotiable: true,
    projectedAnnualSavingsCents: 24000,
    accountMask: "4402",
  },
  {
    id: uuid("city-water"),
    name: "City Water Works",
    category: "utilities",
    lastAmountCents: 5400,
    expectedAmountCents: 5400,
    dueDay: 17,
    cadence: "monthly",
    autopay: false,
    negotiable: false,
    accountMask: "4402",
  },
  {
    id: uuid("streamtv"),
    name: "StreamTV Cable",
    category: "telecommunications",
    lastAmountCents: 11999,
    expectedAmountCents: 11999,
    dueDay: 25,
    cadence: "monthly",
    autopay: true,
    negotiable: true,
    projectedAnnualSavingsCents: 30000,
    accountMask: "7719",
  },
];

export function getDemoBill(id: string): Bill | undefined {
  return DEMO_BILLS.find((bill) => bill.id === id);
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export const DEMO_ALERTS: AlertItem[] = [
  {
    id: uuid("alert-price"),
    type: "price_increase",
    severity: "warning",
    title: "Design Suite Pro raised its price",
    body: "The monthly plan went from $49.99 to $54.99 — a $5.00 increase. Your next charge on Aug 28 will reflect the new rate.",
    createdAt: isoDaysAgo(0, 14),
    readAt: null,
  },
  {
    id: uuid("alert-newsub"),
    type: "new_subscription_detected",
    severity: "info",
    title: "New subscription detected: Meal Kit Weekly",
    body: "A recurring charge of $49.00 per week appeared on Chase Sapphire (•7719). This is your third charge.",
    createdAt: isoDaysAgo(1, 9),
    readAt: null,
  },
  {
    id: uuid("alert-upcoming"),
    type: "upcoming_bill",
    severity: "info",
    title: "Fibernet Internet is due in 5 days",
    body: "$89.99 will be charged to Premier Checking (•4402) — covered by autopay.",
    createdAt: isoDaysAgo(2, 8),
    readAt: isoDaysAgo(2, 10),
  },
  {
    id: uuid("alert-lowbal"),
    type: "low_balance",
    severity: "warning",
    title: "Checking balance below $500",
    body: "Premier Checking (•4402) dropped to $412.18 after the Cloud Storage charge. Scheduled transfers were held.",
    createdAt: isoDaysAgo(3, 19),
    readAt: isoDaysAgo(3, 21),
  },
  {
    id: uuid("alert-canceled"),
    type: "subscription_canceled",
    severity: "info",
    title: "Domain Renewal canceled",
    body: "Cancellation confirmed by the provider. You reclaimed $17.99 per year — added to your savings total.",
    createdAt: isoDaysAgo(5, 11),
    readAt: isoDaysAgo(5, 12),
  },
  {
    id: uuid("alert-bank"),
    type: "bank_connection_error",
    severity: "warning",
    title: "Re-authentication required for Chase Sapphire",
    body: "The bank changed its login flow. Reconnect to keep transaction detection current.",
    createdAt: isoDaysAgo(9, 10),
    readAt: isoDaysAgo(9, 15),
  },
];

// ─── Savings ledger ──────────────────────────────────────────────────────────
//
// Convention: canceled-subscription and negotiated-bill events record the
// first-year amount reclaimed; refunds record the fee amount returned.

export const DEMO_SAVINGS_EVENTS: SavingsEvent[] = [
  {
    id: uuid("save-domain"),
    kind: "subscription_canceled",
    amountCents: 1799,
    description: "Canceled Domain Renewal — $17.99 per year",
    occurredAt: isoDaysAgo(5),
  },
  {
    id: uuid("save-fibernet"),
    kind: "bill_negotiated",
    amountCents: 21600,
    description: "Fibernet Internet negotiated down $18.00 per month",
    occurredAt: isoDaysAgo(24),
  },
  {
    id: uuid("save-overdraft"),
    kind: "fee_refunded",
    amountCents: 3500,
    description: "Overdraft fee refunded by Metro Bank",
    occurredAt: isoDaysAgo(38),
  },
  {
    id: uuid("save-videobox"),
    kind: "subscription_canceled",
    amountCents: 23988,
    description: "Canceled Video Rental Box — $119.94 per year",
    occurredAt: isoDaysAgo(67),
  },
  {
    id: uuid("save-cellular"),
    kind: "bill_negotiated",
    amountCents: 14400,
    description: "Cellular One negotiated down $12.00 per month",
    occurredAt: isoDaysAgo(96),
  },
  {
    id: uuid("save-newspro"),
    kind: "subscription_canceled",
    amountCents: 11988,
    description: "Canceled News Pro — $119.88 per year",
    occurredAt: isoDaysAgo(128),
  },
  {
    id: uuid("save-latefee"),
    kind: "fee_refunded",
    amountCents: 2800,
    description: "Late fee refunded on Chase Sapphire",
    occurredAt: isoDaysAgo(155),
  },
];

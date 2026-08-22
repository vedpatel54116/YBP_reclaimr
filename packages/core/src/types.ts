/**
 * Core domain vocabulary. These unions deliberately mirror the Prisma enums
 * (apps/api/prisma/schema.prisma) and the wire schemas (packages/shared);
 * core stays dependency-free so it can be tested with zero infrastructure.
 */

export type TransactionCategory =
  | "income"
  | "housing"
  | "utilities"
  | "telecommunications"
  | "groceries"
  | "dining"
  | "transportation"
  | "health"
  | "fitness"
  | "insurance"
  | "entertainment"
  | "subscriptions"
  | "shopping"
  | "travel"
  | "education"
  | "fees"
  | "transfers"
  | "savings"
  | "other";

export type BillingCadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";

export type AlertType =
  | "low_balance"
  | "large_purchase"
  | "upcoming_bill"
  | "price_increase"
  | "new_subscription_detected"
  | "subscription_canceled"
  | "bank_connection_error";

export type AlertSeverity = "info" | "warning";

/**
 * Concierge case vocabulary. Mirrors the CaseStatus Prisma enum and the
 * shared wire schema; `offer_pending` is negotiation-only.
 */
export type CaseStatus =
  "submitted" | "in_review" | "in_progress" | "offer_pending" | "succeeded" | "failed" | "canceled";

/** Who acted on a case. Authority per transition lives in the state machine. */
export type CaseActor = "member" | "concierge" | "system";

export type CaseKind = "cancellation" | "negotiation";

/** One entry in a case's append-only status timeline. */
export interface TimelineEvent {
  /** ISO-8601 instant. */
  at: string;
  status: CaseStatus;
  actor: CaseActor;
  note: string | null;
}

/**
 * A transaction as the detection engine sees it. Amounts follow the aggregator
 * sign convention: positive = money leaving the account.
 */
export interface DetectionTransaction {
  /** Caller's row id, echoed back on detections for isRecurring updates. */
  id: string;
  occurredAt: Date;
  merchantName: string;
  amountCents: number;
  category: TransactionCategory;
}

/**
 * Detection-time knowledge about a normalized merchant key, sourced from the
 * Merchant table by the caller. Everything optional — detection works from
 * transaction signals alone; hints refine classification.
 */
export interface MerchantHints {
  displayName?: string;
  category?: TransactionCategory;
  isSubscriptionProvider?: boolean;
  negotiable?: boolean;
}

/** Normalized merchant key → curated knowledge. */
export type MerchantHintTable = ReadonlyMap<string, MerchantHints>;

/** A recurring-charge series the engine believes is a subscription. */
export interface DetectedSubscription {
  merchantKey: string;
  displayName: string;
  category: TransactionCategory;
  /** Latest charge amount — the number members recognize. */
  amountCents: number;
  /** Prior charge level when a price change was flagged; null otherwise. */
  previousAmountCents: number | null;
  priceChanged: boolean;
  cadence: BillingCadence;
  /** Median observed interval; refines next-charge prediction. */
  cadenceDays: number;
  firstChargeAt: Date;
  lastChargeAt: Date;
  nextChargeAt: Date;
  monthlyEquivalentCents: number;
  /** Detection confidence in [0, 1]. */
  confidence: number;
  occurrenceCount: number;
  /** False when the series went quiet (zombie / canceled by the member). */
  isActive: boolean;
  /** Rows to flag isRecurring for this series. */
  transactionIds: string[];
}

/** A recurring bill series (utilities, telecom, insurance, housing). */
export interface DetectedBill {
  merchantKey: string;
  displayName: string;
  category: TransactionCategory;
  cadence: BillingCadence;
  cadenceDays: number;
  lastAmountCents: number;
  /** Robust expectation for the next charge (median over the series). */
  expectedAmountCents: number;
  /** Day of month (1–31) charges cluster around. */
  dueDay: number;
  confidence: number;
  occurrenceCount: number;
  isActive: boolean;
  /** Concierge negotiation is offered for this payee. */
  negotiable: boolean;
  lastChargeAt: Date;
  firstChargeAt: Date;
  transactionIds: string[];
}

/** A system alert candidate, produced by pure rules; persistence dedupes. */
export interface AlertDraft {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  body: string;
  /** Stable key (userId-scoped) used to suppress duplicates. */
  dedupKey: string;
  data: Record<string, unknown>;
}

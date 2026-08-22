import type { Subscription as PrismaSubscription } from "@prisma/client";
import type { Subscription, TimelineEvent } from "@reclaimr/shared";

/**
 * Prisma row → shared domain shape. Dates become ISO strings (date-only for
 * billing dates); absent data becomes null, never undefined.
 */
export function toSubscription(row: PrismaSubscription): Subscription {
  return {
    id: row.id,
    merchantId: row.merchantId,
    name: row.name,
    amountCents: row.amountCents,
    currency: row.currency,
    cadence: row.cadence,
    status: row.status,
    nextBillingDate: row.nextBillingDate.toISOString().slice(0, 10),
    source: row.source,
    confidence: row.confidence,
    firstDetectedAt: row.firstDetectedAt?.toISOString() ?? null,
    lastChargedAt: row.lastChargedAt?.toISOString().slice(0, 10) ?? null,
    priceChangedAt: row.priceChangedAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Prisma stores case timelines as Json; narrow once at the boundary. */
export function toTimeline(value: unknown): TimelineEvent[] {
  return Array.isArray(value) ? (value as TimelineEvent[]) : [];
}

/** "YYYY-MM-DD" → UTC-midnight Date for the DATE column. */
export function toDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

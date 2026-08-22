import type { CancellationCase as PrismaCancellationCase, Prisma } from "@prisma/client";
import type { CancellationCase, TimelineEvent } from "@reclaimr/shared";

/**
 * The wire shape carries the subscription's display name so a client can
 * render a case list without a second round trip. The name lives on the
 * subscription row, so every read joins it.
 */
export type CancellationCaseRow = PrismaCancellationCase & {
  subscription: { name: string };
};

export const CANCELLATION_INCLUDE = {
  subscription: { select: { name: true } },
} as const;

/** Prisma stores case timelines as Json; narrow once at the boundary. */
export function toTimeline(value: unknown): TimelineEvent[] {
  return Array.isArray(value) ? (value as TimelineEvent[]) : [];
}

/** Timeline back to a Prisma Json input. */
export function toJsonTimeline(timeline: readonly TimelineEvent[]): Prisma.InputJsonValue {
  return timeline as unknown as Prisma.InputJsonValue;
}

export function toCancellationCase(row: CancellationCaseRow): CancellationCase {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    subscriptionName: row.subscription.name,
    monthlyAmountCents: row.monthlyAmountCents,
    status: row.status,
    reason: row.reason,
    timeline: toTimeline(row.timeline),
    // `requestedAt` is when the member asked; it never changes, so it reads
    // from createdAt rather than a separate column.
    requestedAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    outcomeNote: row.outcomeNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

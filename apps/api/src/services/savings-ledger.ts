import type {
  Prisma,
  PrismaClient,
  SavingsEvent as SavingsEventRow,
  SavingsKind,
} from "@prisma/client";
import { cancellationSavingsCents, settleNegotiation } from "@reclaimr/core";

/**
 * The reclaimed-money ledger.
 *
 * This is the most trust-sensitive write in the product: the number members
 * judge us by. Three rules are enforced here rather than at call sites, so
 * they hold for every caller:
 *
 *  1. Append-only. Entries are never updated or deleted.
 *  2. Exactly-once per source. A `(sourceType, sourceId)` unique index means a
 *     retried approval, a duplicated webhook, or a double-clicked button
 *     credits the member once. The insert is allowed to lose that race and
 *     reports `created: false` instead of throwing.
 *  3. Confirmed only. Every entry traces to a resolved case or an explicit
 *     member action — never to a projection.
 */

/** Prisma's unique-constraint violation. */
const UNIQUE_VIOLATION = "P2002";

export interface LedgerEntry {
  userId: string;
  kind: SavingsKind;
  amountCents: number;
  description: string;
  /** Injected so callers can record inside a case's own resolution instant. */
  occurredAt: Date;
  sourceType: "cancellation" | "negotiation" | "refund" | "manual";
  sourceId: string | null;
}

export interface LedgerResult {
  /** False when this source was already credited, or the amount rounded to 0. */
  created: boolean;
  amountCents: number;
  /** The inserted row, or null when nothing was written. */
  event: SavingsEventRow | null;
}

/** Ledger writes participate in the caller's transaction when one is passed. */
type Db = PrismaClient | Prisma.TransactionClient;

export class SavingsLedger {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Record a saving, ignoring a duplicate for the same source.
   *
   * A non-positive amount is skipped rather than rejected: "we saved you $0"
   * is a legitimate outcome (a negotiation whose fee consumed the whole
   * saving), and the schema requires positive amounts.
   */
  async record(entry: LedgerEntry, db: Db = this.prisma): Promise<LedgerResult> {
    if (entry.amountCents <= 0) return { created: false, amountCents: 0, event: null };

    try {
      const event = await db.savingsEvent.create({
        data: {
          userId: entry.userId,
          kind: entry.kind,
          amountCents: entry.amountCents,
          description: entry.description,
          occurredAt: startOfUtcDay(entry.occurredAt),
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
        },
      });
      return { created: true, amountCents: entry.amountCents, event };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { created: false, amountCents: entry.amountCents, event: null };
      }
      throw error;
    }
  }

  /**
   * Credit a successful cancellation with the first-year value of the
   * subscription the member no longer pays for.
   */
  async recordCancellation(
    input: {
      userId: string;
      caseId: string;
      subscriptionName: string;
      /** Monthly-equivalent snapshot taken when the case was opened. */
      monthlyAmountCents: number;
      resolvedAt: Date;
    },
    db?: Db,
  ): Promise<LedgerResult> {
    return this.record(
      {
        userId: input.userId,
        kind: "subscription_canceled",
        // The snapshot is already monthly-equivalent, so annualize directly.
        amountCents: cancellationSavingsCents(input.monthlyAmountCents, "monthly"),
        description: `Canceled ${input.subscriptionName}`,
        occurredAt: input.resolvedAt,
        sourceType: "cancellation",
        sourceId: input.caseId,
      },
      db,
    );
  }

  /**
   * Credit an approved negotiation with what the member actually keeps —
   * confirmed savings minus our success fee. The gross figure and the fee stay
   * on the case for the breakdown; the ledger records the member's share,
   * because that is what "reclaimed" means to them.
   */
  async recordNegotiation(
    input: {
      userId: string;
      caseId: string;
      billName: string;
      confirmedAnnualSavingsCents: number;
      feePercent: number;
      resolvedAt: Date;
    },
    db?: Db,
  ): Promise<LedgerResult> {
    const settlement = settleNegotiation(input.confirmedAnnualSavingsCents, input.feePercent);
    return this.record(
      {
        userId: input.userId,
        kind: "bill_negotiated",
        amountCents: settlement.netAnnualSavingsCents,
        description: `Negotiated ${input.billName}`,
        occurredAt: input.resolvedAt,
        sourceType: "negotiation",
        sourceId: input.caseId,
      },
      db,
    );
  }
}

/** Savings are recorded against a calendar day (the column is DATE). */
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

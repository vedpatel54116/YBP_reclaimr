import type { PrismaClient } from "@prisma/client";
import {
  findLargePurchases,
  findLowBalanceAccounts,
  findUpcomingBills,
  LARGE_PURCHASE_THRESHOLD_CENTS,
  LOW_BALANCE_THRESHOLD_CENTS,
  UPCOMING_BILL_WINDOW_DAYS,
  type AlertDraft,
  type AlertType,
} from "@reclaimr/core";

/** How far back large-purchase evaluation looks. */
const LARGE_PURCHASE_LOOKBACK_DAYS = 7;

function dedupKeyOf(alert: { data: unknown }): string | null {
  const value = alert.data;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const key = (value as Record<string, unknown>).dedupKey;
    return typeof key === "string" ? key : null;
  }
  return null;
}

/**
 * Alert generation. Rules live in @reclaimr/core (pure, tested); this
 * service loads member state, runs them, and persists deduplicated rows.
 * Dedup: an unread alert with the same dedupKey suppresses a re-fire, so
 * evaluating every few minutes never spams the member.
 */
export class AlertService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Record one alert. Returns whether it was created (false = deduplicated).
   * Delegates to `recordMany` so single and batch writes cannot drift apart:
   * dedup must compare against *every* unread alert of the type, not an
   * arbitrary one.
   */
  async record(userId: string, draft: AlertDraft): Promise<boolean> {
    return (await this.recordMany(userId, [draft])) > 0;
  }

  /** Evaluate all standing rules for a member. Returns alerts created. */
  async evaluateUser(userId: string, now: Date = new Date()): Promise<number> {
    const [accounts, bills, recentCharges] = await Promise.all([
      this.prisma.connectedAccount.findMany({ where: { userId, status: "connected" } }),
      this.prisma.bill.findMany({ where: { userId, isActive: true } }),
      this.prisma.transaction.findMany({
        where: {
          userId,
          amountCents: { gt: 0 },
          occurredAt: { gte: new Date(now.getTime() - LARGE_PURCHASE_LOOKBACK_DAYS * 86_400_000) },
        },
        orderBy: { occurredAt: "desc" },
      }),
    ]);

    const drafts: AlertDraft[] = [
      ...findLowBalanceAccounts(
        accounts.map((a) => ({
          accountId: a.id,
          name: a.name,
          type: a.type,
          balanceCents: a.balanceCents,
        })),
        LOW_BALANCE_THRESHOLD_CENTS,
      ),
      ...findLargePurchases(
        recentCharges.map((t) => ({
          transactionId: t.id,
          merchantName: t.merchantName,
          amountCents: t.amountCents,
        })),
        LARGE_PURCHASE_THRESHOLD_CENTS,
      ),
      ...findUpcomingBills(
        bills.map((b) => ({
          billId: b.id,
          name: b.name,
          dueDay: b.dueDay,
          expectedAmountCents: b.expectedAmountCents,
          lastAmountCents: b.lastAmountCents,
        })),
        now,
        UPCOMING_BILL_WINDOW_DAYS,
      ).map((match) => match.draft),
    ];

    return this.recordMany(userId, drafts);
  }

  /** Record many with dedup; returns how many were actually created. */
  async recordMany(userId: string, drafts: readonly AlertDraft[]): Promise<number> {
    const types = [...new Set(drafts.map((d) => d.type))] as AlertType[];
    if (types.length === 0) return 0;
    const unread = await this.prisma.alert.findMany({
      where: { userId, type: { in: types }, readAt: null },
    });
    const seen = new Set(unread.map(dedupKeyOf).filter((key): key is string => key !== null));

    // Filter against `seen` while extending it, so a batch that contains the
    // same key twice (two rules deriving the same fact) writes it once.
    const fresh: AlertDraft[] = [];
    for (const draft of drafts) {
      if (seen.has(draft.dedupKey)) continue;
      seen.add(draft.dedupKey);
      fresh.push(draft);
    }
    if (fresh.length === 0) return 0;
    await this.prisma.alert.createMany({
      data: fresh.map((draft) => ({
        userId,
        type: draft.type,
        severity: draft.severity,
        title: draft.title,
        body: draft.body,
        data: { ...draft.data, dedupKey: draft.dedupKey },
      })),
    });
    return fresh.length;
  }
}

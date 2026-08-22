import type { PrismaClient } from "@prisma/client";
import {
  DEFAULT_NEGOTIATION_SAVINGS_RATE,
  estimatedNegotiationSavingsCents,
  monthlyEquivalentCents,
  subscriptionSpend,
  type SubscriptionSpend,
} from "@reclaimr/core";
import type { SavingsSummary } from "@reclaimr/shared";

export interface BillNegotiationPotential {
  /** Monthly total across active, negotiable bills. */
  monthlyNegotiableCents: number;
  /** Projected first-year savings at the default rate (informational). */
  estimatedAnnualSavingsCents: number;
}

/**
 * Savings calculations. Two distinct concepts:
 *
 *  - "Potential" (projected): what members COULD reclaim — subscription
 *    totals, negotiation projections. Drives insights and the fee slider.
 *  - "Reclaimed" (confirmed): the SavingsEvent ledger. The only number the
 *    dashboard counter trusts (D9: never count unconfirmed savings).
 */
export class SavingsCalculationService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Confirmed savings from the append-only ledger. */
  async summary(userId: string, now: Date = new Date()): Promise<SavingsSummary> {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [events, byKindRows, monthTotal] = await Promise.all([
      this.prisma.savingsEvent.count({ where: { userId } }),
      this.prisma.savingsEvent.groupBy({
        by: ["kind"],
        where: { userId },
        _sum: { amountCents: true },
      }),
      this.prisma.savingsEvent.aggregate({
        where: { userId, occurredAt: { gte: monthStart } },
        _sum: { amountCents: true },
      }),
    ]);

    const totalReclaimedCents = byKindRows.reduce(
      (acc, row) => acc + (row._sum.amountCents ?? 0),
      0,
    );

    return {
      totalReclaimedCents,
      thisMonthCents: monthTotal._sum.amountCents ?? 0,
      eventCount: events,
      byKind: byKindRows.map((row) => ({
        kind: row.kind,
        amountCents: row._sum.amountCents ?? 0,
      })),
    };
  }

  /** Projected subscription spend ("$312/mo") over active subscriptions. */
  async subscriptionSpend(userId: string): Promise<SubscriptionSpend> {
    const rows = await this.prisma.subscription.findMany({
      where: { userId, status: "active" },
      orderBy: { amountCents: "desc" },
    });
    return subscriptionSpend(
      rows.map((row) => ({
        subscriptionId: row.id,
        name: row.name,
        amountCents: row.amountCents,
        cadence: row.cadence,
      })),
    );
  }

  /** Projected negotiation opportunity across active negotiable bills. */
  async billNegotiationPotential(
    userId: string,
    rate: number = DEFAULT_NEGOTIATION_SAVINGS_RATE,
  ): Promise<BillNegotiationPotential> {
    const rows = await this.prisma.bill.findMany({
      where: { userId, isActive: true, negotiable: true },
    });
    const monthlyNegotiableCents = rows.reduce((acc, row) => {
      const amount = row.lastAmountCents ?? row.expectedAmountCents ?? 0;
      return acc + monthlyEquivalentCents(amount, row.cadence);
    }, 0);
    return {
      monthlyNegotiableCents,
      estimatedAnnualSavingsCents: estimatedNegotiationSavingsCents(monthlyNegotiableCents, rate),
    };
  }
}

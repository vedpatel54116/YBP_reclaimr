import type { PremiumSubscription as PrismaPremiumSubscription } from "@prisma/client";
import { premiumPeriodChargeCents, type PremiumState } from "@reclaimr/shared";

/**
 * A free member has no row at all, which the wire contract represents as
 * status "none" with null money fields. Deriving that here keeps every caller
 * from re-inventing "no row means free".
 */
export const FREE_STATE: PremiumState = {
  status: "none",
  priceCentsMonthly: null,
  interval: null,
  periodChargeCents: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  trialEndsAt: null,
  cancelAtPeriodEnd: false,
  updatedAt: new Date(0).toISOString(),
};

export function toPremiumState(row: PrismaPremiumSubscription | null): PremiumState {
  if (!row) return { ...FREE_STATE, updatedAt: new Date().toISOString() };

  return {
    status: row.status,
    priceCentsMonthly: row.priceCentsMonthly,
    interval: row.interval,
    // Derived, never stored: the charge is a function of price and cadence, and
    // a stored copy could disagree with what the provider actually bills.
    periodChargeCents: premiumPeriodChargeCents(row.priceCentsMonthly, row.interval),
    currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    updatedAt: row.updatedAt.toISOString(),
  };
}

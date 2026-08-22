import { roundMoneyCents } from "../stats";
import type { BillingCadence } from "../types";

/** Canonical interval length per cadence (days). */
export const CADENCE_DAYS: Record<BillingCadence, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30.4375,
  quarterly: 91.3125,
  annual: 365.25,
};

/**
 * Normalize any recurring amount to its monthly equivalent — the number the
 * dashboard totals ("$312/mo in subscriptions"). Integer cents, half-up.
 */
export function monthlyEquivalentCents(amountCents: number, cadence: BillingCadence): number {
  return roundMoneyCents((amountCents * 30.4375) / CADENCE_DAYS[cadence]);
}

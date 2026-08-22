import { roundMoneyCents } from "../stats";
import type { BillingCadence } from "../types";
import { monthlyEquivalentCents } from "./monthly-equivalent";

/**
 * Concierge case money. Every number a member is charged or credited is
 * computed here, in one place, from integers — so the fee shown in the app,
 * the fee stored on the case, and the fee invoiced can never disagree.
 */

/**
 * A fee share must be a whole percentage of the savings it is charged against.
 * The narrower *product* band (35–60%) lives in @reclaimr/shared, where the
 * wire schema enforces it — duplicating those bounds here would let the two
 * copies drift apart, so this only rejects values that are not percentages.
 */
export function isValidFeePercent(feePercent: number): boolean {
  return Number.isInteger(feePercent) && feePercent > 0 && feePercent <= 100;
}

export interface NegotiationSettlement {
  /** First-year savings the provider agreed to, as approved by the member. */
  confirmedAnnualSavingsCents: number;
  /** Our success fee: feePercent × confirmed savings. */
  feeAmountCents: number;
  /** What the member keeps. Never negative. */
  netAnnualSavingsCents: number;
}

/**
 * Split confirmed savings into our fee and the member's share.
 *
 * Rounding favors the member: the fee is rounded half-up and then clamped so
 * it can never exceed the savings it is charged against. A fee larger than the
 * saving would mean the member paid us to lose money, which must be
 * structurally impossible rather than merely unlikely.
 */
export function settleNegotiation(
  confirmedAnnualSavingsCents: number,
  feePercent: number,
): NegotiationSettlement {
  if (!Number.isInteger(confirmedAnnualSavingsCents) || confirmedAnnualSavingsCents < 0) {
    throw new Error("confirmedAnnualSavingsCents must be a non-negative integer");
  }
  if (!isValidFeePercent(feePercent)) {
    throw new Error("feePercent must be a whole percentage in (0, 100]");
  }

  const rawFee = roundMoneyCents((confirmedAnnualSavingsCents * feePercent) / 100);
  const feeAmountCents = Math.min(rawFee, confirmedAnnualSavingsCents);

  return {
    confirmedAnnualSavingsCents,
    feeAmountCents,
    netAnnualSavingsCents: confirmedAnnualSavingsCents - feeAmountCents,
  };
}

/**
 * First-year savings booked when a subscription is successfully canceled.
 *
 * Canceling a $15/mo subscription reclaims $180 over the following year, and
 * the annual figure is what the ledger records — the same basis negotiations
 * use, so the reclaimed counter sums comparable numbers instead of mixing
 * monthly and annual amounts.
 */
export function cancellationSavingsCents(
  amountCents: number,
  cadence: BillingCadence = "monthly",
): number {
  return monthlyEquivalentCents(amountCents, cadence) * 12;
}

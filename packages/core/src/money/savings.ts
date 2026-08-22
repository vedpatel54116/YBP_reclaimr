import { roundMoneyCents } from "../stats";
import type { BillingCadence } from "../types";
import { monthlyEquivalentCents } from "./monthly-equivalent";

/**
 * Savings projections. Projected numbers power insights and the fee slider;
 * the *reclaimed* counter itself only ever reads the confirmed SavingsEvent
 * ledger (trust principle: never count unconfirmed savings).
 */

export interface SubscriptionSpendLine {
  subscriptionId: string;
  name: string;
  monthlyCents: number;
  annualCents: number;
}

export interface SubscriptionSpend {
  monthlyTotalCents: number;
  annualTotalCents: number;
  lines: SubscriptionSpendLine[];
}

export interface SubscriptionSpendInput {
  subscriptionId: string;
  name: string;
  amountCents: number;
  cadence: BillingCadence;
}

/** Monthly/annual totals across active subscriptions ("potential savings"). */
export function subscriptionSpend(
  subscriptions: readonly SubscriptionSpendInput[],
): SubscriptionSpend {
  const lines = subscriptions.map((sub) => {
    const monthlyCents = monthlyEquivalentCents(sub.amountCents, sub.cadence);
    return {
      subscriptionId: sub.subscriptionId,
      name: sub.name,
      monthlyCents,
      annualCents: monthlyCents * 12,
    };
  });
  const monthlyTotalCents = lines.reduce((acc, line) => acc + line.monthlyCents, 0);
  return { monthlyTotalCents, annualTotalCents: monthlyTotalCents * 12, lines };
}

/** Default first-year savings share used to project negotiation outcomes. */
export const DEFAULT_NEGOTIATION_SAVINGS_RATE = 0.15;

/** Projected annual savings from negotiating recurring bills (informational). */
export function estimatedNegotiationSavingsCents(
  monthlyBillCents: number,
  rate: number = DEFAULT_NEGOTIATION_SAVINGS_RATE,
): number {
  return roundMoneyCents(monthlyBillCents * 12 * rate);
}

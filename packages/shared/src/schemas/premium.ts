import { z } from "zod";
import {
  PREMIUM_PRICE_MAX_CENTS,
  PREMIUM_PRICE_MIN_CENTS,
  PREMIUM_YEARLY_MONTHS_CHARGED,
} from "../constants";

/**
 * Premium membership state. "none" is derived (no row exists) — the other
 * statuses come from the billing provider.
 */
export const premiumStatusSchema = z.enum([
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);
export type PremiumStatus = z.infer<typeof premiumStatusSchema>;

/**
 * Billing cadence for premium. Members pick a monthly price either way; the
 * yearly plan charges that price × PREMIUM_YEARLY_MONTHS_CHARGED up front.
 */
export const premiumIntervalSchema = z.enum(["monthly", "yearly"]);
export type PremiumInterval = z.infer<typeof premiumIntervalSchema>;

/** Amount actually charged per billing period for a chosen monthly price. */
export function premiumPeriodChargeCents(
  priceCentsMonthly: number,
  interval: PremiumInterval,
): number {
  return interval === "yearly"
    ? priceCentsMonthly * PREMIUM_YEARLY_MONTHS_CHARGED
    : priceCentsMonthly;
}

export const premiumStateSchema = z.object({
  status: premiumStatusSchema,
  /** Monthly price in cents; null while status is "none". */
  priceCentsMonthly: z
    .number()
    .int()
    .min(PREMIUM_PRICE_MIN_CENTS)
    .max(PREMIUM_PRICE_MAX_CENTS)
    .nullable(),
  /** Billing cadence; null while status is "none". */
  interval: premiumIntervalSchema.nullable(),
  /** What the member is charged each period (derived); null when "none". */
  periodChargeCents: z.number().int().min(0).nullable(),
  currentPeriodStart: z.string().datetime().nullable(),
  currentPeriodEnd: z.string().datetime().nullable(),
  trialEndsAt: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type PremiumState = z.infer<typeof premiumStateSchema>;

/**
 * Choose-your-price upgrade ($7–$14/mo, billed monthly or yearly), optionally
 * starting a 7-day trial.
 */
export const upgradePremiumSchema = z.object({
  priceCentsMonthly: z.number().int().min(PREMIUM_PRICE_MIN_CENTS).max(PREMIUM_PRICE_MAX_CENTS),
  interval: premiumIntervalSchema.default("monthly"),
  startTrial: z.boolean().default(false),
});
export type UpgradePremiumInput = z.input<typeof upgradePremiumSchema>;
export type UpgradePremiumParsed = z.output<typeof upgradePremiumSchema>;

/** Checkout session URL when the billing provider requires a redirect. */
export const upgradePremiumResponseSchema = z.object({
  state: premiumStateSchema,
  checkoutUrl: z.string().url().nullable(),
});
export type UpgradePremiumResponse = z.infer<typeof upgradePremiumResponseSchema>;

import { stripeEnabled, type Env } from "../../env";
import { MockBillingAdapter } from "./mock-adapter";
import { StripeBillingAdapter } from "./http-adapter";
import type { BillingAdapter } from "./types";

export { MockBillingAdapter } from "./mock-adapter";
export { StripeBillingAdapter } from "./http-adapter";
export {
  BillingAdapterError,
  type BillingAdapter,
  type BillingEvent,
  type BillingSubscription,
  type CheckoutSession,
  type CreateCheckoutSession,
} from "./types";

/**
 * Billing composition root, mirroring `createPlaidAdapter`: real provider when
 * credentials exist, deterministic mock otherwise.
 *
 * Production refuses to fall back. A missing key in development is a
 * convenience; in production it would mean handing out premium for free, so it
 * fails at boot rather than at the first upgrade.
 */
export function createBillingAdapter(config: Env): BillingAdapter {
  if (stripeEnabled(config)) {
    return new StripeBillingAdapter(config.STRIPE_SECRET_KEY!, config.STRIPE_WEBHOOK_SECRET);
  }
  if (config.NODE_ENV === "production") {
    throw new Error("STRIPE_SECRET_KEY is required in production");
  }
  return new MockBillingAdapter();
}

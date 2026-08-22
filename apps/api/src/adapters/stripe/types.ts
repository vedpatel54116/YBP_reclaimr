import type { PremiumInterval, PremiumStatus } from "@reclaimr/shared";

/**
 * Billing provider port.
 *
 * Everything above this interface speaks in ReclaimR's own vocabulary —
 * `PremiumStatus`, cents, `PremiumInterval` — and knows nothing about Stripe.
 * That matters for two reasons: the webhook handler becomes testable without
 * signing fixtures, and local development needs no Stripe account at all.
 */

/** Provider-agnostic view of a subscription's current state. */
export interface BillingSubscription {
  /** Provider subscription id. */
  id: string;
  customerId: string;
  status: PremiumStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  /**
   * Chosen monthly price and cadence, echoed back from provider metadata we
   * set at checkout. Null when the provider did not return metadata (an
   * out-of-band subscription), in which case the local row keeps its values.
   */
  priceCentsMonthly: number | null;
  interval: PremiumInterval | null;
  /** Our user id, carried through checkout metadata. */
  userId: string | null;
}

export interface CreateCheckoutSession {
  userId: string;
  email: string;
  /** Chosen monthly price; the yearly plan charges this × 10. */
  priceCentsMonthly: number;
  interval: PremiumInterval;
  /** Trial length, or null for none. */
  trialDays: number | null;
  /** Reuse an existing provider customer so a member has one billing identity. */
  existingCustomerId: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

/**
 * Normalized webhook event. `ignored` exists so the webhook route can
 * acknowledge deliveries we do not act on: returning an error for an event type
 * we simply do not care about would make the provider retry it forever.
 */
export type BillingEvent =
  | { id: string; type: "checkout_completed"; subscription: BillingSubscription }
  | { id: string; type: "subscription_updated"; subscription: BillingSubscription }
  | { id: string; type: "subscription_deleted"; subscription: BillingSubscription }
  | { id: string; type: "payment_failed"; subscriptionId: string | null; customerId: string | null }
  | { id: string; type: "ignored"; providerType: string };

export interface BillingAdapter {
  createCheckoutSession(input: CreateCheckoutSession): Promise<CheckoutSession>;
  /** Schedule cancellation at period end; members keep access until then. */
  cancelAtPeriodEnd(subscriptionId: string): Promise<BillingSubscription>;
  /** Undo a scheduled cancellation. */
  resume(subscriptionId: string): Promise<BillingSubscription>;
  /**
   * Verify the provider's signature and decode the payload. Throws
   * {@link BillingAdapterError} with kind "invalid_signature" when the request
   * cannot be trusted — the webhook endpoint has no other authentication, so
   * this check is the entire security boundary.
   */
  parseWebhook(rawBody: Buffer, signature: string | undefined): BillingEvent;
}

export type BillingErrorKind =
  "invalid_signature" | "not_configured" | "provider_error" | "not_found";

export class BillingAdapterError extends Error {
  constructor(
    readonly kind: BillingErrorKind,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "BillingAdapterError";
  }
}

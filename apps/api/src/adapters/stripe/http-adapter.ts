import Stripe from "stripe";
import {
  premiumPeriodChargeCents,
  type PremiumInterval,
  type PremiumStatus,
} from "@reclaimr/shared";
import {
  BillingAdapterError,
  type BillingAdapter,
  type BillingEvent,
  type BillingSubscription,
  type CheckoutSession,
  type CreateCheckoutSession,
} from "./types";

/** Pinned so a Stripe-side upgrade cannot silently change payload shapes. */
const API_VERSION = "2025-02-24.acacia" as const;

/** Metadata keys we set at checkout and read back on every webhook. */
const META_USER_ID = "reclaimr_user_id";
const META_PRICE = "reclaimr_price_cents_monthly";
const META_INTERVAL = "reclaimr_interval";

/**
 * Stripe status → our `PremiumStatus`.
 *
 * The judgement calls are the failure states. `past_due` and `incomplete` still
 * grant access because Stripe is mid-retry and the member most likely just
 * needs to update a card. `unpaid` and `incomplete_expired` mean Stripe has
 * given up, so the entitlement genuinely ends.
 */
function toPremiumStatus(status: Stripe.Subscription.Status): PremiumStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "incomplete":
      return "past_due";
    case "canceled":
    case "paused":
      return "canceled";
    case "unpaid":
    case "incomplete_expired":
      return "expired";
    default:
      return "expired";
  }
}

function toDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

function readInterval(value: string | undefined): PremiumInterval | null {
  return value === "monthly" || value === "yearly" ? value : null;
}

function readPrice(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function customerIdOf(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
}

/** Live Stripe integration. */
export class StripeBillingAdapter implements BillingAdapter {
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string | undefined,
  ) {
    this.stripe = new Stripe(secretKey, { apiVersion: API_VERSION });
  }

  async createCheckoutSession(input: CreateCheckoutSession): Promise<CheckoutSession> {
    const unitAmount = premiumPeriodChargeCents(input.priceCentsMonthly, input.interval);

    try {
      const session = await this.stripe.checkout.sessions.create({
        mode: "subscription",
        // Choose-your-price means there is no fixed Price object to reference,
        // so the amount is declared inline per session.
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: unitAmount,
              recurring: { interval: input.interval === "yearly" ? "year" : "month" },
              product_data: {
                name: `ReclaimR Premium (${input.interval})`,
              },
            },
          },
        ],
        ...(input.existingCustomerId
          ? { customer: input.existingCustomerId }
          : { customer_email: input.email }),
        client_reference_id: input.userId,
        // Mirrored onto the subscription so every later webhook can be resolved
        // to a member and a price without a database lookup by customer id.
        subscription_data: {
          metadata: {
            [META_USER_ID]: input.userId,
            [META_PRICE]: String(input.priceCentsMonthly),
            [META_INTERVAL]: input.interval,
          },
          ...(input.trialDays ? { trial_period_days: input.trialDays } : {}),
        },
        metadata: { [META_USER_ID]: input.userId },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      });

      if (!session.url) {
        throw new BillingAdapterError("provider_error", "Stripe returned a session with no URL");
      }
      return { id: session.id, url: session.url };
    } catch (error) {
      throw this.wrap(error, "Failed to create a checkout session");
    }
  }

  async cancelAtPeriodEnd(subscriptionId: string): Promise<BillingSubscription> {
    try {
      const updated = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
      return this.toBillingSubscription(updated);
    } catch (error) {
      throw this.wrap(error, "Failed to schedule cancellation");
    }
  }

  async resume(subscriptionId: string): Promise<BillingSubscription> {
    try {
      const updated = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });
      return this.toBillingSubscription(updated);
    } catch (error) {
      throw this.wrap(error, "Failed to resume the subscription");
    }
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): BillingEvent {
    if (!this.webhookSecret) {
      throw new BillingAdapterError("not_configured", "STRIPE_WEBHOOK_SECRET is not set");
    }
    if (!signature) {
      throw new BillingAdapterError("invalid_signature", "Missing Stripe-Signature header");
    }

    let event: Stripe.Event;
    try {
      // Verifies both the HMAC and the timestamp tolerance, which is what makes
      // replaying a captured payload useless.
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (error) {
      throw new BillingAdapterError(
        "invalid_signature",
        error instanceof Error ? error.message : "Signature verification failed",
      );
    }

    return this.normalize(event);
  }

  private normalize(event: Stripe.Event): BillingEvent {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // A subscription-mode session always carries a subscription once
        // completed; anything else is not ours to act on.
        if (session.mode !== "subscription" || !session.subscription) {
          return { id: event.id, type: "ignored", providerType: event.type };
        }
        return {
          id: event.id,
          type: "checkout_completed",
          subscription: this.fromSessionSubscription(session),
        };
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
        return {
          id: event.id,
          type: "subscription_updated",
          subscription: this.toBillingSubscription(event.data.object),
        };

      case "customer.subscription.deleted":
        return {
          id: event.id,
          type: "subscription_deleted",
          subscription: this.toBillingSubscription(event.data.object),
        };

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscription = (invoice as { subscription?: string | { id: string } | null })
          .subscription;
        return {
          id: event.id,
          type: "payment_failed",
          subscriptionId:
            typeof subscription === "string" ? subscription : (subscription?.id ?? null),
          customerId:
            typeof invoice.customer === "string"
              ? invoice.customer
              : (invoice.customer?.id ?? null),
        };
      }

      default:
        return { id: event.id, type: "ignored", providerType: event.type };
    }
  }

  /**
   * A completed checkout session references its subscription by id and does not
   * embed the period fields, so this yields a partial snapshot. The follow-up
   * `customer.subscription.created` event fills in the dates; treating checkout
   * as "grant access now, refine on the next event" avoids blocking the member
   * on a second round trip to Stripe.
   */
  private fromSessionSubscription(session: Stripe.Checkout.Session): BillingSubscription {
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : (session.subscription?.id ?? "");

    return {
      id: subscriptionId,
      customerId:
        typeof session.customer === "string" ? session.customer : (session.customer?.id ?? ""),
      // Checkout completing means payment (or trial setup) succeeded. The exact
      // status arrives with the subscription event.
      status: "active",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
      priceCentsMonthly: null,
      interval: null,
      userId: session.client_reference_id ?? session.metadata?.[META_USER_ID] ?? null,
    };
  }

  private toBillingSubscription(subscription: Stripe.Subscription): BillingSubscription {
    const metadata = subscription.metadata ?? {};
    // Period fields moved onto items in newer API versions; read whichever the
    // payload carries so the adapter survives that shift.
    const item = subscription.items?.data[0];
    const periodStart =
      (subscription as { current_period_start?: number }).current_period_start ??
      (item as { current_period_start?: number } | undefined)?.current_period_start ??
      null;
    const periodEnd =
      (subscription as { current_period_end?: number }).current_period_end ??
      (item as { current_period_end?: number } | undefined)?.current_period_end ??
      null;

    return {
      id: subscription.id,
      customerId: customerIdOf(subscription),
      status: toPremiumStatus(subscription.status),
      currentPeriodStart: toDate(periodStart),
      currentPeriodEnd: toDate(periodEnd),
      trialEndsAt: toDate(subscription.trial_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      priceCentsMonthly: readPrice(metadata[META_PRICE]),
      interval: readInterval(metadata[META_INTERVAL]),
      userId: metadata[META_USER_ID] ?? null,
    };
  }

  private wrap(error: unknown, message: string): BillingAdapterError {
    if (error instanceof BillingAdapterError) return error;
    const code = (error as { code?: string } | null)?.code;
    const detail = error instanceof Error ? error.message : String(error);
    return new BillingAdapterError("provider_error", `${message}: ${detail}`, code);
  }
}

import type { PrismaClient } from "@prisma/client";
import {
  PREMIUM_PRICE_MAX_CENTS,
  PREMIUM_PRICE_MIN_CENTS,
  type PremiumInterval,
} from "@reclaimr/shared";
import type { FastifyBaseLogger } from "fastify";
import type { BillingEvent, BillingSubscription } from "../../adapters/stripe";
import type { AuditService } from "../../services/audit";

/** Prisma's unique-constraint violation. */
const UNIQUE_VIOLATION = "P2002";

export interface WebhookOutcome {
  /** False when this event id was already applied. */
  applied: boolean;
  /** What the handler did, for logging and tests. */
  action:
    "granted" | "updated" | "ended" | "payment_failed" | "ignored" | "duplicate" | "unmatched";
}

/**
 * Billing webhook handler — the only writer that grants or revokes premium.
 *
 * Two properties are non-negotiable here:
 *
 *  1. **Exactly once.** Providers deliver at-least-once and retry aggressively.
 *     Every event is claimed by inserting its id into `stripe_events` first; a
 *     duplicate loses that insert and returns without re-applying anything.
 *  2. **Never fail loudly at the transport.** Anything that is not a signature
 *     problem is acknowledged, because a non-2xx makes the provider redeliver
 *     forever. Unmatched events are logged and audited instead.
 */
export class BillingWebhookService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async handle(event: BillingEvent): Promise<WebhookOutcome> {
    // Events we do not act on are dropped before the idempotency claim. They
    // have no side effects to deduplicate, and providers emit far more of them
    // than of the ones we care about — recording each would fill the table with
    // rows that protect nothing.
    if (event.type === "ignored") {
      this.logger.debug({ providerType: event.providerType }, "Ignoring billing event");
      return { applied: true, action: "ignored" };
    }

    // Claim the event before doing any work. Losing this race means another
    // delivery of the same event already ran.
    if (!(await this.claim(event.id, event.type))) {
      return { applied: false, action: "duplicate" };
    }

    switch (event.type) {
      case "checkout_completed":
      case "subscription_updated":
        return this.applySubscription(event.subscription, event.type);
      case "subscription_deleted":
        return this.endSubscription(event.subscription);
      case "payment_failed":
        return this.markPastDue(event.subscriptionId, event.customerId);
    }
  }

  /** Insert the event id; false when it was already present. */
  private async claim(eventId: string, type: string): Promise<boolean> {
    try {
      await this.prisma.stripeEvent.create({ data: { id: eventId, type } });
      return true;
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === UNIQUE_VIOLATION) return false;
      throw error;
    }
  }

  /**
   * Upsert the local mirror from a provider snapshot.
   *
   * Resolution order for the member is deliberate: metadata we set at checkout
   * first, then the subscription id, then the customer id. Metadata is the only
   * one that works for a brand-new subscription, while the id lookups handle
   * later events whose metadata may have been stripped.
   */
  private async applySubscription(
    subscription: BillingSubscription,
    eventType: "checkout_completed" | "subscription_updated",
  ): Promise<WebhookOutcome> {
    const userId = await this.resolveUserId(subscription);
    if (!userId) {
      this.logger.warn(
        { subscriptionId: subscription.id, customerId: subscription.customerId },
        "Billing event did not match a member",
      );
      return { applied: true, action: "unmatched" };
    }

    const existing = await this.prisma.premiumSubscription.findUnique({ where: { userId } });

    // Price and cadence come from provider metadata; fall back to what we
    // already stored so a metadata-less event cannot zero out the member's
    // price. A first-time subscription with neither is rejected rather than
    // guessed at.
    const priceCentsMonthly = clampPrice(
      subscription.priceCentsMonthly ?? existing?.priceCentsMonthly ?? null,
    );
    if (priceCentsMonthly === null) {
      this.logger.warn(
        { subscriptionId: subscription.id, userId },
        "Billing event carried no usable price",
      );
      return { applied: true, action: "unmatched" };
    }
    const interval: PremiumInterval = subscription.interval ?? existing?.interval ?? "monthly";

    const data = {
      status: subscription.status === "none" ? "canceled" : subscription.status,
      priceCentsMonthly,
      interval,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      externalCustomerId: subscription.customerId || (existing?.externalCustomerId ?? null),
      externalSubscriptionId: subscription.id || (existing?.externalSubscriptionId ?? null),
      // A checkout-completed snapshot has no period dates; keep whatever we
      // have rather than blanking a known period.
      ...(subscription.currentPeriodStart
        ? { currentPeriodStart: subscription.currentPeriodStart }
        : {}),
      ...(subscription.currentPeriodEnd ? { currentPeriodEnd: subscription.currentPeriodEnd } : {}),
      ...(subscription.trialEndsAt ? { trialEndsAt: subscription.trialEndsAt } : {}),
    } as const;

    const row = await this.prisma.premiumSubscription.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    await this.audit.record({
      actorType: "system",
      userId,
      action: eventType === "checkout_completed" ? "premium.granted" : "premium.updated",
      targetType: "premium_subscription",
      targetId: row.id,
      metadata: {
        status: row.status,
        interval: row.interval,
        priceCentsMonthly: row.priceCentsMonthly,
        externalSubscriptionId: row.externalSubscriptionId,
      },
    });

    return { applied: true, action: existing ? "updated" : "granted" };
  }

  /** The provider ended the subscription; the entitlement is over. */
  private async endSubscription(subscription: BillingSubscription): Promise<WebhookOutcome> {
    const userId = await this.resolveUserId(subscription);
    if (!userId) return { applied: true, action: "unmatched" };

    const row = await this.prisma.premiumSubscription.update({
      where: { userId },
      data: {
        status: "canceled",
        cancelAtPeriodEnd: false,
        ...(subscription.currentPeriodEnd
          ? { currentPeriodEnd: subscription.currentPeriodEnd }
          : {}),
      },
    });

    await this.audit.record({
      actorType: "system",
      userId,
      action: "premium.ended",
      targetType: "premium_subscription",
      targetId: row.id,
    });

    return { applied: true, action: "ended" };
  }

  /**
   * A charge failed. The member stays entitled (see the entitlements plugin):
   * the provider will retry, and locking someone out of the tool that saves
   * them money over one expired card would be self-defeating. The status change
   * is what lets the UI prompt them to fix it.
   */
  private async markPastDue(
    subscriptionId: string | null,
    customerId: string | null,
  ): Promise<WebhookOutcome> {
    const row = await this.findMirror(subscriptionId, customerId);
    if (!row) return { applied: true, action: "unmatched" };

    // Do not overwrite a terminal status with past_due; a canceled membership
    // failing a final invoice is still canceled.
    if (row.status === "canceled" || row.status === "expired") {
      return { applied: true, action: "ignored" };
    }

    await this.prisma.premiumSubscription.update({
      where: { id: row.id },
      data: { status: "past_due" },
    });

    await this.audit.record({
      actorType: "system",
      userId: row.userId,
      action: "premium.payment_failed",
      targetType: "premium_subscription",
      targetId: row.id,
    });

    return { applied: true, action: "payment_failed" };
  }

  private async resolveUserId(subscription: BillingSubscription): Promise<string | null> {
    if (subscription.userId) {
      // Confirm the member still exists before writing a row against them.
      const user = await this.prisma.user.findUnique({
        where: { id: subscription.userId },
        select: { id: true },
      });
      if (user) return user.id;
    }
    const mirror = await this.findMirror(subscription.id, subscription.customerId);
    return mirror?.userId ?? null;
  }

  private async findMirror(subscriptionId: string | null, customerId: string | null) {
    if (subscriptionId) {
      const bySubscription = await this.prisma.premiumSubscription.findFirst({
        where: { externalSubscriptionId: subscriptionId },
      });
      if (bySubscription) return bySubscription;
    }
    if (customerId) {
      return this.prisma.premiumSubscription.findFirst({
        where: { externalCustomerId: customerId },
      });
    }
    return null;
  }
}

/**
 * Refuse a price outside the published band. A provider payload claiming $900/mo
 * is either a bug or tampering, and either way it must not become the number we
 * show the member as their price.
 */
function clampPrice(value: number | null): number | null {
  if (value === null) return null;
  if (value < PREMIUM_PRICE_MIN_CENTS || value > PREMIUM_PRICE_MAX_CENTS) return null;
  return value;
}

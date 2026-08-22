import type { PrismaClient } from "@prisma/client";
import {
  PREMIUM_TRIAL_DAYS,
  type PremiumState,
  type UpgradePremiumParsed,
  type UpgradePremiumResponse,
} from "@reclaimr/shared";
import type { BillingAdapter } from "../../adapters/stripe";
import type { Env } from "../../env";
import { badRequest, conflict, notFound } from "../../lib/errors";
import type { AuditService, RequestContext } from "../../services/audit";
import { toPremiumState } from "./mapper";

/**
 * Premium membership.
 *
 * The local `PremiumSubscription` row is a *mirror* of the billing provider's
 * state, never the source of truth. Only the webhook handler promotes a member
 * to an entitled status; this service starts checkouts and records intent. That
 * split is deliberate: a member who abandons Stripe's payment page must not end
 * up with premium because we optimistically wrote a row first.
 */
export class PremiumService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly billing: BillingAdapter,
    private readonly audit: AuditService,
    private readonly config: Env,
  ) {}

  async get(userId: string): Promise<PremiumState> {
    const row = await this.prisma.premiumSubscription.findUnique({ where: { userId } });
    return toPremiumState(row);
  }

  /**
   * Begin a checkout. Returns the provider's hosted-page URL along with the
   * member's *current* (pre-checkout) state — the status only advances once the
   * provider confirms over the webhook.
   */
  async upgrade(
    userId: string,
    input: UpgradePremiumParsed,
    ctx: RequestContext,
  ): Promise<UpgradePremiumResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, deletionScheduledAt: true },
    });
    if (!user) throw notFound("User not found");
    if (user.deletionScheduledAt) {
      throw badRequest("This account is scheduled for deletion", "ACCOUNT_CLOSING");
    }

    const existing = await this.prisma.premiumSubscription.findUnique({ where: { userId } });
    if (existing && (existing.status === "active" || existing.status === "trialing")) {
      throw conflict("This account already has an active membership", "ALREADY_PREMIUM");
    }

    // A trial is offered once per account. Someone who already had a row has
    // already had their trial, so re-granting it would make the trial infinite.
    const trialDays = input.startTrial && !existing ? PREMIUM_TRIAL_DAYS : null;

    const session = await this.billing.createCheckoutSession({
      userId,
      email: user.email,
      priceCentsMonthly: input.priceCentsMonthly,
      interval: input.interval,
      trialDays,
      existingCustomerId: existing?.externalCustomerId ?? null,
      successUrl: this.config.STRIPE_SUCCESS_URL,
      cancelUrl: this.config.STRIPE_CANCEL_URL,
    });

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: userId,
      userId,
      action: "premium.checkout_started",
      targetType: "premium_subscription",
      targetId: existing?.id ?? null,
      metadata: {
        priceCentsMonthly: input.priceCentsMonthly,
        interval: input.interval,
        trialDays,
        sessionId: session.id,
      },
    });

    return { state: toPremiumState(existing), checkoutUrl: session.url };
  }

  /**
   * Cancel at period end. Members keep everything they paid for until the
   * period closes; cutting access at the moment of cancellation would be
   * charging for time we then refuse to serve.
   */
  async cancel(userId: string, ctx: RequestContext): Promise<PremiumState> {
    const existing = await this.prisma.premiumSubscription.findUnique({ where: { userId } });
    if (!existing) throw notFound("No membership to cancel");
    if (!existing.externalSubscriptionId) {
      throw conflict("This membership has no billing subscription", "NO_BILLING_SUBSCRIPTION");
    }
    if (existing.cancelAtPeriodEnd) return toPremiumState(existing);

    const remote = await this.billing.cancelAtPeriodEnd(existing.externalSubscriptionId);

    const row = await this.prisma.premiumSubscription.update({
      where: { userId },
      data: {
        cancelAtPeriodEnd: remote.cancelAtPeriodEnd,
        ...(remote.currentPeriodEnd ? { currentPeriodEnd: remote.currentPeriodEnd } : {}),
      },
    });

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: userId,
      userId,
      action: "premium.cancel_scheduled",
      targetType: "premium_subscription",
      targetId: row.id,
      metadata: { currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null },
    });

    return toPremiumState(row);
  }

  /** Undo a scheduled cancellation while the period is still open. */
  async resume(userId: string, ctx: RequestContext): Promise<PremiumState> {
    const existing = await this.prisma.premiumSubscription.findUnique({ where: { userId } });
    if (!existing) throw notFound("No membership to resume");
    if (!existing.externalSubscriptionId) {
      throw conflict("This membership has no billing subscription", "NO_BILLING_SUBSCRIPTION");
    }
    // Once the period has closed the subscription is gone at the provider, so
    // "resume" is no longer a modification — it is a new purchase.
    if (existing.status === "canceled" || existing.status === "expired") {
      throw conflict("This membership has ended; upgrade again to restart", "MEMBERSHIP_ENDED");
    }
    if (!existing.cancelAtPeriodEnd) return toPremiumState(existing);

    const remote = await this.billing.resume(existing.externalSubscriptionId);

    const row = await this.prisma.premiumSubscription.update({
      where: { userId },
      data: { cancelAtPeriodEnd: remote.cancelAtPeriodEnd },
    });

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: userId,
      userId,
      action: "premium.resumed",
      targetType: "premium_subscription",
      targetId: row.id,
    });

    return toPremiumState(row);
  }
}

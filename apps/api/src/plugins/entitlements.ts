import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { PremiumStatus } from "@reclaimr/shared";
import { forbidden } from "../lib/errors";

declare module "fastify" {
  interface FastifyInstance {
    /**
     * Route guard: rejects members without an active premium entitlement.
     * Attach *after* `requireAuth`, which establishes who is asking:
     *
     *   { preHandler: [app.requireAuth, app.requirePremium] }
     */
    requirePremium: (request: FastifyRequest) => Promise<void>;
  }
}

/**
 * Statuses that entitle a member to concierge features.
 *
 * `trialing` counts — the trial exists to be used. `past_due` also counts:
 * Stripe retries a failed payment for days, and locking someone out of a
 * cancellation case because a card expired would cost them more money than the
 * subscription we are dunning them for. Access ends at `canceled`/`expired`,
 * once billing has actually given up.
 */
const ENTITLED: readonly PremiumStatus[] = ["trialing", "active", "past_due"];

export function isEntitled(status: PremiumStatus): boolean {
  return ENTITLED.includes(status);
}

/**
 * Premium entitlement check, read from the local mirror of the billing
 * provider's state (kept current by the Stripe webhook). Reading our own
 * database rather than calling Stripe keeps the request path fast and keeps
 * concierge features working during a Stripe outage.
 */
export const entitlementsPlugin: FastifyPluginAsync = fp(
  async (app) => {
    app.decorate("requirePremium", async (request: FastifyRequest) => {
      // requireAuth must have run first; a missing user is a wiring bug.
      const userId = request.user?.sub;
      if (!userId) {
        throw forbidden("Premium check requires an authenticated member", "NOT_AUTHENTICATED");
      }

      const premium = await app.prisma.premiumSubscription.findUnique({
        where: { userId },
        select: { status: true, currentPeriodEnd: true },
      });

      // No row means the member never upgraded — the free tier sees detection
      // only, which is the product's core give-before-you-ask promise.
      if (!premium || !isEntitled(premium.status)) {
        throw forbidden("This feature requires ReclaimR Premium", "PREMIUM_REQUIRED");
      }

      // Defense in depth: if a webhook was missed and the paid period has
      // lapsed, refuse rather than serve indefinitely off stale state.
      if (premium.currentPeriodEnd && premium.currentPeriodEnd.getTime() < Date.now()) {
        throw forbidden("Your premium membership has lapsed", "PREMIUM_REQUIRED");
      }
    });
  },
  { name: "entitlements", dependencies: ["prisma", "auth"] },
);

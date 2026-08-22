import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { upgradePremiumSchema } from "@reclaimr/shared";
import { BillingAdapterError, type BillingAdapter } from "../../adapters/stripe";
import { unauthorized } from "../../lib/errors";
import type { PremiumService } from "./premium.service";
import type { BillingWebhookService } from "./webhook.service";

function requestContext(request: FastifyRequest) {
  return { ip: request.ip, userAgent: request.headers["user-agent"] ?? null };
}

export interface PremiumRoutesOptions {
  premium: PremiumService;
}

/** Member-facing premium endpoints. All require an authenticated member. */
export const premiumRoutes: FastifyPluginAsync<PremiumRoutesOptions> = async (app, options) => {
  const { premium } = options;

  app.get("/premium", { preHandler: app.requireAuth }, async (request) => {
    return premium.get(request.user!.sub);
  });

  app.post(
    "/premium/upgrade",
    // Tighter than the global limit: each call creates a provider-side checkout
    // session, so this is an endpoint worth protecting from being hammered.
    {
      preHandler: app.requireAuth,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request) => {
      const input = upgradePremiumSchema.parse(request.body);
      return premium.upgrade(request.user!.sub, input, requestContext(request));
    },
  );

  app.post("/premium/cancel", { preHandler: app.requireAuth }, async (request) => {
    return premium.cancel(request.user!.sub, requestContext(request));
  });

  app.post("/premium/resume", { preHandler: app.requireAuth }, async (request) => {
    return premium.resume(request.user!.sub, requestContext(request));
  });
};

export interface BillingWebhookRoutesOptions {
  billing: BillingAdapter;
  webhooks: BillingWebhookService;
}

/**
 * Provider webhook sink.
 *
 * Registered as its own plugin for one reason: signature verification needs the
 * exact bytes the provider signed, so this scope replaces the JSON body parser
 * with one that hands over the raw Buffer. Fastify encapsulates content-type
 * parsers per plugin, so the rest of the API keeps parsing JSON normally.
 *
 * There is no auth guard here by design — the signature *is* the authentication.
 */
export const billingWebhookRoutes: FastifyPluginAsync<BillingWebhookRoutesOptions> = async (
  app,
  options,
) => {
  const { billing, webhooks } = options;

  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) =>
    done(null, body),
  );

  app.post(
    "/billing/webhook",
    {
      // Providers burst retries; keep a ceiling but well above normal volume.
      config: { rateLimit: { max: 300, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
      const signature = request.headers["stripe-signature"];

      let event;
      try {
        event = billing.parseWebhook(raw, typeof signature === "string" ? signature : undefined);
      } catch (error) {
        // An unverifiable payload is the one case worth rejecting: it is either
        // misconfiguration or forgery, and retrying will not fix either.
        if (error instanceof BillingAdapterError) {
          request.log.warn({ kind: error.kind }, "Rejected billing webhook");
          throw unauthorized("Invalid webhook signature", "INVALID_SIGNATURE");
        }
        throw error;
      }

      const outcome = await webhooks.handle(event);
      request.log.info(
        { eventId: event.id, type: event.type, action: outcome.action },
        "Handled billing webhook",
      );

      // Always 200 once the signature is valid. A non-2xx would make the
      // provider redeliver an event we have already recorded as applied.
      return reply.code(200).send({ received: true, action: outcome.action });
    },
  );
};

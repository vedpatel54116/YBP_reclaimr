import type { FastifyPluginAsync } from "fastify";
import {
  exchangePublicTokenRequestSchema,
  type CreateLinkTokenResponse,
  type ExchangePublicTokenResponse,
  type InitialSync,
} from "@reclaimr/shared";
import type { BankingServices } from "../../services/banking";

/**
 * Plaid Link endpoints. The browser runs Plaid Link with the minted token
 * and posts the resulting public token back through the BFF; the access
 * token that comes back from the exchange never leaves the server.
 */
export const plaidRoutes: FastifyPluginAsync<{ banking: BankingServices }> = async (
  app,
  options,
) => {
  const { plaidLink, syncPipeline } = options.banking;

  app.post("/create-link-token", { preHandler: app.requireAuth }, async (request) => {
    const response: CreateLinkTokenResponse = await plaidLink.createLinkToken(request.user!.sub);
    return response;
  });

  app.post("/exchange-public-token", { preHandler: app.requireAuth }, async (request, reply) => {
    const input = exchangePublicTokenRequestSchema.parse(request.body);
    const item = await plaidLink.exchange(request.user!.sub, input);

    // Pull initial history right away: queued when Redis is up, inline
    // otherwise (local dev still gets a fully populated account).
    const pipeline = await syncPipeline.runForItem(request.user!.sub, item.plaidItemId);
    const initialSync: InitialSync =
      pipeline.mode === "queued"
        ? { status: "queued", addedTransactions: null }
        : { status: "synced", addedTransactions: pipeline.sync?.added ?? 0 };

    const response: ExchangePublicTokenResponse = { accounts: item.accounts, initialSync };
    return reply.code(201).send(response);
  });
};

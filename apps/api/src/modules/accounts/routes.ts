import type { FastifyPluginAsync, FastifyReply } from "fastify";
import {
  idParamSchema,
  listQuerySchema,
  type ApiErrorResponse,
  type SyncAccountResponse,
} from "@reclaimr/shared";
import { badRequest } from "../../lib/errors";
import type { BankingServices } from "../../services/banking";

function notFound(reply: FastifyReply): FastifyReply {
  const payload: ApiErrorResponse = { error: "Not Found", message: "Account not found" };
  return reply.code(404).send(payload);
}

/** Linked accounts: list, inspect, and trigger syncs. All routes protected. */
export const accountRoutes: FastifyPluginAsync<{ banking: BankingServices }> = async (
  app,
  options,
) => {
  const { accounts, syncPipeline } = options.banking;

  app.get("/accounts", { preHandler: app.requireAuth }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    return accounts.list(request.user!.sub, query);
  });

  app.get("/accounts/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const account = await accounts.get(request.user!.sub, id);
    if (!account) return notFound(reply);
    return account;
  });

  app.post("/accounts/:id/sync", { preHandler: app.requireAuth }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);

    // Syncs operate per Plaid item; resolve the account's owner item.
    const plaidItemId = await accounts.findItemIdForAccount(request.user!.sub, id);
    if (!plaidItemId) {
      throw badRequest("Account is not aggregator-linked and cannot be synced", "NOT_LINKED");
    }

    const pipeline = await syncPipeline.runForItem(request.user!.sub, plaidItemId);
    const response: SyncAccountResponse =
      pipeline.mode === "queued"
        ? {
            accountId: id,
            status: "queued",
            addedTransactions: null,
            updatedTransactions: null,
            removedTransactions: null,
          }
        : {
            accountId: id,
            status: "synced",
            addedTransactions: pipeline.sync?.added ?? 0,
            updatedTransactions: pipeline.sync?.updated ?? 0,
            removedTransactions: pipeline.sync?.removed ?? 0,
          };
    return reply.code(pipeline.mode === "queued" ? 202 : 200).send(response);
  });
};

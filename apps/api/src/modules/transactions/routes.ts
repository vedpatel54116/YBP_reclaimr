import type { FastifyPluginAsync, FastifyReply } from "fastify";
import {
  idParamSchema,
  listTransactionsQuerySchema,
  updateTransactionSchema,
  type ApiErrorResponse,
} from "@reclaimr/shared";
import type { BankingServices } from "../../services/banking";

function notFound(reply: FastifyReply): FastifyReply {
  const payload: ApiErrorResponse = { error: "Not Found", message: "Transaction not found" };
  return reply.code(404).send(payload);
}

/**
 * Transaction ledger endpoints: filtered listing plus member annotations
 * (category, note). Ledger data itself is immutable — it only changes by
 * aggregator sync.
 */
export const transactionRoutes: FastifyPluginAsync<{ banking: BankingServices }> = async (
  app,
  options,
) => {
  const service = options.banking.transactions;

  app.get("/transactions", { preHandler: app.requireAuth }, async (request) => {
    const query = listTransactionsQuerySchema.parse(request.query);
    return service.list(request.user!.sub, query);
  });

  app.get("/transactions/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const transaction = await service.get(request.user!.sub, id);
    if (!transaction) return notFound(reply);
    return transaction;
  });

  app.patch("/transactions/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const patch = updateTransactionSchema.parse(request.body);
    const transaction = await service.update(request.user!.sub, id, patch);
    if (!transaction) return notFound(reply);
    return transaction;
  });
};

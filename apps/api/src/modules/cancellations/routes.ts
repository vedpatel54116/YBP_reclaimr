import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  createCancellationSchema,
  idParamSchema,
  listCancellationsQuerySchema,
} from "@reclaimr/shared";
import { notFound } from "../../lib/errors";
import type { CancellationService } from "./service";

function requestContext(request: FastifyRequest) {
  return { ip: request.ip, userAgent: request.headers["user-agent"] ?? null };
}

export interface CancellationRoutesOptions {
  cancellations: CancellationService;
}

/**
 * Concierge cancellation requests.
 *
 * Writes require premium — doing the work on a member's behalf is the paid
 * product. Reads only require authentication, so a member whose card lapsed
 * can still see what happened to cases we already took on; paywalling their
 * own history would be punitive rather than persuasive.
 */
export const cancellationRoutes: FastifyPluginAsync<CancellationRoutesOptions> = async (
  app,
  options,
) => {
  const { cancellations } = options;

  app.get("/cancellations", { preHandler: app.requireAuth }, async (request) => {
    const query = listCancellationsQuerySchema.parse(request.query);
    return cancellations.list(request.user!.sub, query);
  });

  app.post(
    "/cancellations",
    { preHandler: [app.requireAuth, app.requirePremium] },
    async (request, reply) => {
      const input = createCancellationSchema.parse(request.body);
      const created = await cancellations.create(request.user!.sub, input, requestContext(request));
      return reply.code(201).send(created);
    },
  );

  app.get("/cancellations/:id", { preHandler: app.requireAuth }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const found = await cancellations.findOwned(request.user!.sub, id);
    if (!found) throw notFound("Cancellation case not found");
    return found;
  });

  app.post(
    "/cancellations/:id/withdraw",
    { preHandler: [app.requireAuth, app.requirePremium] },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const updated = await cancellations.withdraw(request.user!.sub, id, requestContext(request));
      if (!updated) throw notFound("Cancellation case not found");
      return updated;
    },
  );
};

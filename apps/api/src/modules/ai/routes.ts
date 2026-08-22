import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { idParamSchema, type ApiErrorResponse } from "@reclaimr/shared";
import type { AiServices } from "../../services/ai";

function notFound(reply: FastifyReply): FastifyReply {
  const payload: ApiErrorResponse = { error: "Not Found", message: "Subscription not found" };
  return reply.code(404).send(payload);
}

/**
 * AI suggestion reads. Generation happens in the background (worker) or inline
 * after a sync when Redis is absent, so these routes only serve the cache —
 * a page load never waits on a model call.
 *
 * Alternative advice is free-tier on purpose: it is the feature that proves the
 * product's value before asking anyone to pay.
 */
export const aiRoutes: FastifyPluginAsync<{ ai: AiServices }> = async (app, options) => {
  const { advisor } = options.ai;

  app.get(
    "/subscriptions/:id/suggestions",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const userId = request.user!.sub;

      // Distinguish "no such subscription" (404) from "nothing generated yet"
      // (200 with null), and never confirm the existence of another member's row.
      const owned = await app.prisma.subscription.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!owned) return notFound(reply);

      return reply.send({ data: await advisor.findForSubscription(userId, id) });
    },
  );
};

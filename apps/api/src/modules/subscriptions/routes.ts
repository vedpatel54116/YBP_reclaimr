import type { FastifyPluginAsync, FastifyReply } from "fastify";
import {
  createSubscriptionSchema,
  idParamSchema,
  listSubscriptionsQuerySchema,
  updateSubscriptionSchema,
  type ApiErrorResponse,
} from "@reclaimr/shared";
import { SubscriptionService } from "./service";

function notFound(reply: FastifyReply): FastifyReply {
  const payload: ApiErrorResponse = { error: "Not Found", message: "Subscription not found" };
  return reply.code(404).send(payload);
}

/** Member subscription CRUD. Every route requires a valid access token. */
export const subscriptionRoutes: FastifyPluginAsync = async (app) => {
  const service = new SubscriptionService(app.prisma);

  app.get("/subscriptions", { preHandler: app.requireAuth }, async (request) => {
    const query = listSubscriptionsQuerySchema.parse(request.query);
    return service.list(request.user!.sub, query);
  });

  app.post("/subscriptions", { preHandler: app.requireAuth }, async (request, reply) => {
    const input = createSubscriptionSchema.parse(request.body);
    const subscription = await service.create(request.user!.sub, input);
    return reply.code(201).send(subscription);
  });

  app.get("/subscriptions/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const subscription = await service.findOwned(request.user!.sub, id);
    if (!subscription) return notFound(reply);
    return subscription;
  });

  app.patch("/subscriptions/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const patch = updateSubscriptionSchema.parse(request.body);
    const subscription = await service.update(request.user!.sub, id, patch);
    if (!subscription) return notFound(reply);
    return subscription;
  });

  app.delete("/subscriptions/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    if (!(await service.remove(request.user!.sub, id))) return notFound(reply);
    return reply.code(204).send();
  });
};

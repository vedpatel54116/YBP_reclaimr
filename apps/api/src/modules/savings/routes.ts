import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { createSavingsEventSchema, listSavingsEventsQuerySchema } from "@reclaimr/shared";
import type { SavingsCalculationService } from "./savings-calculation.service";
import type { SavingsEventService } from "./savings-event.service";

function requestContext(request: FastifyRequest) {
  return { ip: request.ip, userAgent: request.headers["user-agent"] ?? null };
}

export interface SavingsRoutesOptions {
  calculations: SavingsCalculationService;
  events: SavingsEventService;
}

/**
 * The reclaimed-money ledger and its dashboard aggregate. Free members see
 * their savings too — the counter is the proof the product works, so it is
 * never behind the paywall.
 */
export const savingsRoutes: FastifyPluginAsync<SavingsRoutesOptions> = async (app, options) => {
  const { calculations, events } = options;

  app.get("/savings/summary", { preHandler: app.requireAuth }, async (request) => {
    return calculations.summary(request.user!.sub);
  });

  app.get("/savings/events", { preHandler: app.requireAuth }, async (request) => {
    const query = listSavingsEventsQuerySchema.parse(request.query);
    return events.list(request.user!.sub, query);
  });

  app.post("/savings/events", { preHandler: app.requireAuth }, async (request, reply) => {
    const input = createSavingsEventSchema.parse(request.body);
    const event = await events.createManual(request.user!.sub, input, requestContext(request));
    return reply.code(201).send(event);
  });
};

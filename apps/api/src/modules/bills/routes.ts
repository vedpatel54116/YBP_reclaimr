import type { FastifyPluginAsync } from "fastify";
import {
  createBillSchema,
  idParamSchema,
  listBillsQuerySchema,
  updateBillSchema,
  upcomingBillsQuerySchema,
} from "@reclaimr/shared";
import { notFound } from "../../lib/errors";
import type { BillService } from "./service";

export interface BillRoutesOptions {
  bills: BillService;
}

/** Member bill CRUD plus the calendar projection. All routes require auth. */
export const billRoutes: FastifyPluginAsync<BillRoutesOptions> = async (app, options) => {
  const { bills } = options;

  app.get("/bills", { preHandler: app.requireAuth }, async (request) => {
    const query = listBillsQuerySchema.parse(request.query);
    return bills.list(request.user!.sub, query);
  });

  app.post("/bills", { preHandler: app.requireAuth }, async (request, reply) => {
    const input = createBillSchema.parse(request.body);
    const bill = await bills.create(request.user!.sub, input);
    return reply.code(201).send(bill);
  });

  // Registered before "/bills/:id" so "upcoming" is not captured as an id.
  app.get("/bills/upcoming", { preHandler: app.requireAuth }, async (request) => {
    const query = upcomingBillsQuerySchema.parse(request.query);
    return bills.upcoming(request.user!.sub, query);
  });

  app.get("/bills/:id", { preHandler: app.requireAuth }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const bill = await bills.findOwned(request.user!.sub, id);
    if (!bill) throw notFound("Bill not found");
    return bill;
  });

  app.patch("/bills/:id", { preHandler: app.requireAuth }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const patch = updateBillSchema.parse(request.body);
    const bill = await bills.update(request.user!.sub, id, patch);
    if (!bill) throw notFound("Bill not found");
    return bill;
  });

  app.delete("/bills/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    if (!(await bills.remove(request.user!.sub, id))) throw notFound("Bill not found");
    return reply.code(204).send();
  });
};

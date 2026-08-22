import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { listQuerySchema, recordConsentSchema, updateUserSchema } from "@reclaimr/shared";
import { AuditService } from "../../services/audit";
import { UserService } from "./service";

function requestContext(request: FastifyRequest) {
  return { ip: request.ip, userAgent: request.headers["user-agent"] ?? null };
}

/** Member profile, deletion, and consent endpoints. All routes are protected. */
export const userRoutes: FastifyPluginAsync = async (app) => {
  const service = new UserService(app.prisma, new AuditService(app.prisma, app.log));

  app.get("/users/me", { preHandler: app.requireAuth }, async (request) => {
    return service.getProfile(request.user!.sub);
  });

  app.patch("/users/me", { preHandler: app.requireAuth }, async (request) => {
    const patch = updateUserSchema.parse(request.body);
    return service.updateProfile(request.user!.sub, patch, requestContext(request));
  });

  app.delete("/users/me", { preHandler: app.requireAuth }, async (request) => {
    return service.requestDeletion(request.user!.sub, requestContext(request));
  });

  app.post("/users/me/consents", { preHandler: app.requireAuth }, async (request, reply) => {
    const input = recordConsentSchema.parse(request.body);
    const consent = await service.recordConsent(request.user!.sub, input, requestContext(request));
    return reply.code(201).send(consent);
  });

  app.get("/users/me/consents", { preHandler: app.requireAuth }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    return service.listConsents(request.user!.sub, query);
  });
};

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { loginRequestSchema, refreshRequestSchema, registerRequestSchema } from "@reclaimr/shared";
import { badRequest } from "../../lib/errors";
import { AuditService } from "../../services/audit";
import { AuthService } from "./service";

function requestContext(request: FastifyRequest) {
  return { ip: request.ip, userAgent: request.headers["user-agent"] ?? null };
}

/**
 * Auth endpoints. Credential routes carry a tighter rate limit than the
 * global default to blunt brute-force attempts.
 */
export const authRoutes: FastifyPluginAsync = async (app) => {
  const service = new AuthService(app.prisma, new AuditService(app.prisma, app.log));

  const signup = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = registerRequestSchema.parse(request.body);
    const result = await service.register(input, requestContext(request));
    return reply.code(201).send(result);
  };

  // `/signup` is the canonical path; `/register` stays as an alias so early
  // clients keep working (same handler, same validation).
  app.post("/signup", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, signup);
  app.post("/register", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, signup);

  app.post(
    "/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request) => {
      const input = loginRequestSchema.parse(request.body);
      return service.login(input, requestContext(request));
    },
  );

  app.post("/refresh", async (request) => {
    const { refreshToken } = refreshRequestSchema.parse(request.body);
    return service.refresh(refreshToken, requestContext(request));
  });

  app.post("/logout", async (request, reply) => {
    const { refreshToken } = refreshRequestSchema.parse(request.body);
    await service.logout(refreshToken, requestContext(request));
    return reply.code(204).send();
  });

  app.get("/me", { preHandler: app.requireAuth }, async (request) => {
    const user = await app.prisma.user.findUnique({ where: { id: request.user!.sub } });
    if (!user || user.deletionScheduledAt) {
      throw badRequest("User no longer exists", "INVALID_TOKEN");
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    };
  });
};

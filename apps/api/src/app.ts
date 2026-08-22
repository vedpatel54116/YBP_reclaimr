import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { API_PREFIX, type ApiErrorResponse } from "@reclaimr/shared";
import { corsOrigin, env } from "./env";
import { AppError } from "./lib/errors";
import { authPlugin } from "./plugins/auth";
import { entitlementsPlugin } from "./plugins/entitlements";
import { prismaPlugin } from "./plugins/prisma";
import { queuePlugin } from "./plugins/queue";
import { redisPlugin } from "./plugins/redis";
import { adminRoutes } from "./modules/admin/routes";
import { aiRoutes } from "./modules/ai/routes";
import { authRoutes } from "./modules/auth/routes";
import { billRoutes } from "./modules/bills/routes";
import { billingWebhookRoutes, premiumRoutes } from "./modules/billing/routes";
import { cancellationRoutes } from "./modules/cancellations/routes";
import { negotiationRoutes } from "./modules/negotiations/routes";
import { savingsRoutes } from "./modules/savings/routes";
import { subscriptionRoutes } from "./modules/subscriptions/routes";
import { userRoutes } from "./modules/users/routes";
import { accountRoutes } from "./modules/accounts/routes";
import { plaidRoutes } from "./modules/plaid/routes";
import { transactionRoutes } from "./modules/transactions/routes";
import { healthRoutes } from "./routes/health";
import { createBankingServices } from "./services/banking";
import { createAiServices } from "./services/ai";
import { createConciergeServices, type ConciergeServiceOverrides } from "./services/concierge";

export interface BuildAppOptions {
  logger?: boolean;
  /** Test seam for provider adapters (billing, storage). */
  services?: ConciergeServiceOverrides;
}

/** RFC 9110 reason phrases for the statuses this API emits. */
const REASON_PHRASES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  429: "Too Many Requests",
  500: "Internal Server Error",
};

function reasonPhrase(statusCode: number): string {
  return REASON_PHRASES[statusCode] ?? "Error";
}

/** Builds the Fastify instance (plugins, routes, error mapping) without listening. */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = env(); // Fail fast on invalid configuration.

  const app = Fastify({ logger: options.logger ?? true });

  await app.register(helmet);
  await app.register(cors, { origin: corsOrigin(config) });
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(queuePlugin);

  await app.register(rateLimit, {
    // Global sliding window per IP; Redis-backed when available (falls back
    // to in-memory limiting when REDIS_URL is unset).
    max: 300,
    timeWindow: "1 minute",
    redis: app.redis ?? undefined,
  });

  await app.register(authPlugin);
  await app.register(entitlementsPlugin);

  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    // Zod failures become structured 400s shaped like shared ApiErrorResponse.
    if (error instanceof ZodError) {
      const payload: ApiErrorResponse = {
        error: "Bad Request",
        message: "Request validation failed",
        details: error.flatten(),
      };
      request.log.warn({ issues: error.issues }, "Validation failed");
      return reply.code(400).send(payload);
    }

    if (error instanceof AppError) {
      const payload: ApiErrorResponse = {
        error: reasonPhrase(error.statusCode),
        message: error.message,
        ...(error.code ? { details: { code: error.code } } : {}),
      };
      if (error.statusCode >= 500) request.log.error(error);
      return reply.code(error.statusCode).send(payload);
    }

    const statusCode = (error as FastifyError).statusCode ?? 500;
    if (statusCode >= 500) request.log.error(error);

    const payload: ApiErrorResponse = {
      error: reasonPhrase(statusCode),
      message: statusCode >= 500 ? "Something went wrong" : error.message,
    };
    return reply.code(statusCode).send(payload);
  });

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: `${API_PREFIX}/auth` });
  await app.register(subscriptionRoutes, { prefix: API_PREFIX });
  await app.register(userRoutes, { prefix: API_PREFIX });

  // One banking service graph shared by the accounts, Plaid, and transaction
  // route modules (and by apps/worker, which builds its own). The AI graph is
  // built first so the sync pipeline can refresh advice inline when Redis is
  // absent; with Redis, the worker does it from the queue instead.
  const ai = createAiServices(app.prisma, config, { queue: app.queue });
  const banking = createBankingServices(app.prisma, config, {
    queue: app.queue,
    advisor: ai.advisor,
  });
  await app.register(plaidRoutes, { prefix: `${API_PREFIX}/plaid`, banking });
  await app.register(accountRoutes, { prefix: API_PREFIX, banking });
  await app.register(transactionRoutes, { prefix: API_PREFIX, banking });
  await app.register(aiRoutes, { prefix: API_PREFIX, ai });

  // Concierge cases, billing, and the staff console share one service graph so
  // both case types write through a single savings ledger.
  const concierge = createConciergeServices(app.prisma, config, app.log, options.services);

  await app.register(billRoutes, { prefix: API_PREFIX, bills: concierge.bills });
  await app.register(cancellationRoutes, {
    prefix: API_PREFIX,
    cancellations: concierge.cancellations,
  });
  await app.register(negotiationRoutes, {
    prefix: API_PREFIX,
    negotiations: concierge.negotiations,
    documents: concierge.negotiationDocuments,
  });
  await app.register(savingsRoutes, {
    prefix: API_PREFIX,
    calculations: concierge.savingsCalculations,
    events: concierge.savingsEvents,
  });
  await app.register(premiumRoutes, { prefix: API_PREFIX, premium: concierge.premium });

  // Registered as its own scope: the webhook needs the raw request body for
  // signature verification, which would otherwise break JSON parsing elsewhere.
  await app.register(billingWebhookRoutes, {
    prefix: API_PREFIX,
    billing: concierge.billingAdapter,
    webhooks: concierge.billingWebhooks,
  });

  await app.register(adminRoutes, {
    prefix: `${API_PREFIX}/admin`,
    auth: concierge.admin.auth,
    cases: concierge.admin.cases,
    members: concierge.admin.members,
    merchants: concierge.admin.merchants,
    auditLogs: concierge.admin.auditLogs,
    cancellations: concierge.cancellations,
    negotiations: concierge.negotiations,
  });

  return app;
}

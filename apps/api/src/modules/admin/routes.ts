import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  adminCreateMerchantSchema,
  adminListCasesQuerySchema,
  adminLoginSchema,
  adminUpdateCancellationSchema,
  adminUpdateMerchantSchema,
  adminUpdateNegotiationSchema,
  idParamSchema,
  listAuditLogsQuerySchema,
  listMembersQuerySchema,
} from "@reclaimr/shared";
import { notFound } from "../../lib/errors";
import type { CancellationService } from "../cancellations/service";
import type { NegotiationService } from "../negotiations/service";
import type { AdminAuthService } from "./auth.service";
import type { AdminCaseService } from "./cases.service";
import type {
  AdminAuditService,
  AdminMemberService,
  AdminMerchantService,
} from "./console.service";

function requestContext(request: FastifyRequest) {
  return { ip: request.ip, userAgent: request.headers["user-agent"] ?? null };
}

export interface AdminRoutesOptions {
  auth: AdminAuthService;
  cases: AdminCaseService;
  members: AdminMemberService;
  merchants: AdminMerchantService;
  auditLogs: AdminAuditService;
  cancellations: CancellationService;
  negotiations: NegotiationService;
}

/**
 * Staff console API, mounted under /api/v1/admin.
 *
 * Every route except login is guarded by a capability rather than a bare "is
 * staff" check, so the console's blast radius is defined by role. Member tokens
 * cannot satisfy any of these guards — the realms use different signing secrets
 * and audiences.
 */
export const adminRoutes: FastifyPluginAsync<AdminRoutesOptions> = async (app, options) => {
  const { auth, cases, members, merchants, auditLogs, cancellations, negotiations } = options;

  app.post(
    "/auth/login",
    // Staff logins are few and high value; a tight limit costs nothing here and
    // meaningfully slows credential stuffing.
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request) => {
      const input = adminLoginSchema.parse(request.body);
      return auth.login(input, requestContext(request));
    },
  );

  app.get("/auth/me", { preHandler: app.requireAdmin }, async (request) => {
    return auth.me(request.admin!.sub);
  });

  // ── Concierge queues ──────────────────────────────────────────────────────

  app.get(
    "/cancellations",
    { preHandler: app.requireCapability("cases.read") },
    async (request) => {
      const query = adminListCasesQuerySchema.parse(request.query);
      return cases.listCancellations(query);
    },
  );

  app.get(
    "/cancellations/:id",
    { preHandler: app.requireCapability("cases.read") },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      return cases.getCancellation(id);
    },
  );

  app.patch(
    "/cancellations/:id",
    { preHandler: app.requireCapability("cases.write") },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const patch = adminUpdateCancellationSchema.parse(request.body);

      const updated = await cancellations.advanceAsConcierge(id, patch.status, {
        note: patch.note,
        adminId: request.admin!.sub,
        ctx: requestContext(request),
      });
      if (!updated) throw notFound("Cancellation case not found");
      return updated;
    },
  );

  app.get("/negotiations", { preHandler: app.requireCapability("cases.read") }, async (request) => {
    const query = adminListCasesQuerySchema.parse(request.query);
    return cases.listNegotiations(query);
  });

  app.get(
    "/negotiations/:id",
    { preHandler: app.requireCapability("cases.read") },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      return cases.getNegotiation(id);
    },
  );

  /**
   * Advance a negotiation. The status schema admits `offer_pending` but not
   * `succeeded`: publishing an offer is staff work, accepting it is the
   * member's, and the fee follows the acceptance.
   */
  app.patch(
    "/negotiations/:id",
    { preHandler: app.requireCapability("cases.write") },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const patch = adminUpdateNegotiationSchema.parse(request.body);

      const updated = await negotiations.advanceAsConcierge(id, patch.status, {
        note: patch.note,
        offeredAnnualSavingsCents: patch.offeredAnnualSavingsCents,
        offerNote: patch.offerNote,
        adminId: request.admin!.sub,
        ctx: requestContext(request),
      });
      if (!updated) throw notFound("Negotiation case not found");
      return updated;
    },
  );

  // ── Member directory ──────────────────────────────────────────────────────

  app.get("/members", { preHandler: app.requireCapability("members.read") }, async (request) => {
    const query = listMembersQuerySchema.parse(request.query);
    return members.list(query);
  });

  app.get(
    "/members/:id",
    { preHandler: app.requireCapability("members.read") },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      return members.get(id);
    },
  );

  // ── Merchant curation ─────────────────────────────────────────────────────

  app.get(
    "/merchants",
    { preHandler: app.requireCapability("merchants.read") },
    async (request) => {
      const query = listMembersQuerySchema.parse(request.query);
      return merchants.list(query);
    },
  );

  app.post(
    "/merchants",
    { preHandler: app.requireCapability("merchants.write") },
    async (request, reply) => {
      const input = adminCreateMerchantSchema.parse(request.body);
      const merchant = await merchants.create(input, {
        adminId: request.admin!.sub,
        ctx: requestContext(request),
      });
      return reply.code(201).send(merchant);
    },
  );

  app.patch(
    "/merchants/:id",
    { preHandler: app.requireCapability("merchants.write") },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const patch = adminUpdateMerchantSchema.parse(request.body);
      return merchants.update(id, patch, {
        adminId: request.admin!.sub,
        ctx: requestContext(request),
      });
    },
  );

  // ── Audit trail ───────────────────────────────────────────────────────────

  app.get("/audit-logs", { preHandler: app.requireCapability("audit.read") }, async (request) => {
    const query = listAuditLogsQuerySchema.parse(request.query);
    return auditLogs.list(query);
  });
};

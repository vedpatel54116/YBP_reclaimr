import { API_ROUTES } from "../constants";
import { idParamSchema } from "../schemas/common";
import {
  adminCreateMerchantSchema,
  adminListCasesQuerySchema,
  adminLoginSchema,
  adminMemberSchema,
  adminSessionSchema,
  adminUpdateCancellationSchema,
  adminUpdateMerchantSchema,
  adminUpdateNegotiationSchema,
  auditLogSchema,
  listAuditLogsQuerySchema,
  listMembersQuerySchema,
} from "../schemas/admin";
import { merchantSchema } from "../schemas/merchant";
import { cancellationCaseSchema } from "../schemas/cancellation";
import { negotiationCaseSchema } from "../schemas/negotiation";
import { paginatedSchema } from "../schemas/pagination";

/**
 * Staff console API. Mounted under /api/v1/admin and guarded by the separate
 * staff auth realm (AdminUser accounts, mandatory MFA in production) —
 * member tokens are rejected here and staff tokens are rejected everywhere
 * else.
 */
export const adminContract = {
  login: {
    method: "POST",
    path: API_ROUTES.admin.login,
    body: adminLoginSchema,
    response: adminSessionSchema,
  },
  me: {
    method: "GET",
    path: API_ROUTES.admin.me,
    response: adminSessionSchema,
  },

  /** Concierge work queues. */
  listCancellations: {
    method: "GET",
    path: API_ROUTES.admin.cancellations,
    query: adminListCasesQuerySchema,
    response: paginatedSchema(cancellationCaseSchema),
  },
  getCancellation: {
    method: "GET",
    path: `${API_ROUTES.admin.cancellationDetail("{id}")}`,
    params: idParamSchema,
    response: cancellationCaseSchema,
  },
  /** Advance a cancellation case through its state machine. */
  updateCancellation: {
    method: "PATCH",
    path: `${API_ROUTES.admin.cancellationDetail("{id}")}`,
    params: idParamSchema,
    body: adminUpdateCancellationSchema,
    response: cancellationCaseSchema,
  },
  listNegotiations: {
    method: "GET",
    path: API_ROUTES.admin.negotiations,
    query: adminListCasesQuerySchema,
    response: paginatedSchema(negotiationCaseSchema),
  },
  getNegotiation: {
    method: "GET",
    path: `${API_ROUTES.admin.negotiationDetail("{id}")}`,
    params: idParamSchema,
    response: negotiationCaseSchema,
  },
  /**
   * Advance a negotiation. Succeeding a case requires
   * confirmedAnnualSavingsCents; the fee is computed and charged
   * server-side, idempotently (D9).
   */
  updateNegotiation: {
    method: "PATCH",
    path: `${API_ROUTES.admin.negotiationDetail("{id}")}`,
    params: idParamSchema,
    body: adminUpdateNegotiationSchema,
    response: negotiationCaseSchema,
  },

  /** Masked member directory. */
  listMembers: {
    method: "GET",
    path: API_ROUTES.admin.members,
    query: listMembersQuerySchema,
    response: paginatedSchema(adminMemberSchema),
  },
  getMember: {
    method: "GET",
    path: `${API_ROUTES.admin.memberDetail("{id}")}`,
    params: idParamSchema,
    response: adminMemberSchema,
  },

  /** Merchant curation (finance ops). */
  listMerchants: {
    method: "GET",
    path: API_ROUTES.admin.merchants,
    query: listMembersQuerySchema,
    response: paginatedSchema(merchantSchema),
  },
  createMerchant: {
    method: "POST",
    path: API_ROUTES.admin.merchants,
    body: adminCreateMerchantSchema,
    response: merchantSchema,
  },
  updateMerchant: {
    method: "PATCH",
    path: `${API_ROUTES.admin.merchantDetail("{id}")}`,
    params: idParamSchema,
    body: adminUpdateMerchantSchema,
    response: merchantSchema,
  },

  /** Append-only audit log search. */
  listAuditLogs: {
    method: "GET",
    path: API_ROUTES.admin.audit,
    query: listAuditLogsQuerySchema,
    response: paginatedSchema(auditLogSchema),
  },
} as const;

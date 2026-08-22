import { z } from "zod";
import { caseStatusSchema } from "./common";
import { listQuerySchema } from "./pagination";
import { transactionCategorySchema } from "./transaction";

export const adminRoleSchema = z.enum(["agent", "finance_ops", "admin"]);
export type AdminRole = z.infer<typeof adminRoleSchema>;

/** Staff session response — separate auth realm from members (D6). */
export const adminSessionSchema = z.object({
  admin: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().min(1),
    role: adminRoleSchema,
    /** Whether this account has TOTP enrolled (required in production). */
    mfaEnabled: z.boolean(),
  }),
  accessToken: z.string().min(20),
  expiresIn: z.number().int().min(1),
});
export type AdminSession = z.infer<typeof adminSessionSchema>;

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
  /** 6-digit TOTP code; required when the account has MFA enrolled. */
  mfaCode: z
    .string()
    .regex(/^\d{6}$/, "must be 6 digits")
    .optional(),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

/** Masked member view for staff — never exposes credentials or tokens. */
export const adminMemberSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(120).nullable(),
  isPremium: z.boolean(),
  subscriptionCount: z.number().int().min(0),
  savingsTotalCents: z.number().int().min(0),
  /** Open concierge cases across both queues — the "needs attention" signal. */
  openCaseCount: z.number().int().min(0),
  /** Set when the member requested deletion; staff must not re-engage them. */
  deletionScheduledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type AdminMember = z.infer<typeof adminMemberSchema>;

export const listMembersQuerySchema = listQuerySchema.extend({
  search: z.string().min(1).max(120).optional(),
});
export type ListMembersQuery = z.output<typeof listMembersQuerySchema>;

/**
 * Statuses a concierge may set on a cancellation. `canceled` is excluded:
 * withdrawal belongs to the member alone.
 */
export const adminCancellationStatusSchema = z.enum([
  "in_review",
  "in_progress",
  "succeeded",
  "failed",
]);

/** Concierge advances a case through its state machine. */
export const adminUpdateCancellationSchema = z.object({
  status: adminCancellationStatusSchema,
  note: z.string().max(500).optional(),
});
export type AdminUpdateCancellationInput = z.infer<typeof adminUpdateCancellationSchema>;

/**
 * Statuses a concierge may set on a negotiation. `succeeded` is excluded on
 * purpose — a negotiation only succeeds when the *member* approves the offer,
 * so staff can never book a success fee unilaterally. `canceled` is likewise
 * member-only.
 */
export const adminNegotiationStatusSchema = z.enum([
  "in_review",
  "in_progress",
  "offer_pending",
  "failed",
]);

/**
 * Concierge advances a negotiation. Moving to `offer_pending` publishes the
 * rate secured from the provider; the member then approves or rejects it, and
 * only approval computes and books the fee.
 */
export const adminUpdateNegotiationSchema = z
  .object({
    status: adminNegotiationStatusSchema,
    /** The savings secured, required when publishing an offer. */
    offeredAnnualSavingsCents: z.number().int().min(0).optional(),
    /** Describes the new rate/term shown to the member. */
    offerNote: z.string().max(1000).optional(),
    note: z.string().max(500).optional(),
  })
  .refine(
    (patch) => patch.status !== "offer_pending" || patch.offeredAnnualSavingsCents !== undefined,
    {
      message: "offeredAnnualSavingsCents is required when publishing an offer",
      path: ["offeredAnnualSavingsCents"],
    },
  );
export type AdminUpdateNegotiationInput = z.infer<typeof adminUpdateNegotiationSchema>;

export const adminListCasesQuerySchema = listQuerySchema.extend({
  status: caseStatusSchema.optional(),
  memberId: z.string().uuid().optional(),
});
export type AdminListCasesQuery = z.output<typeof adminListCasesQuerySchema>;

/** Finance-ops merchant curation. */
export const adminCreateMerchantSchema = z.object({
  canonicalName: z.string().min(1).max(120),
  normalizedKey: z.string().min(1).max(120),
  category: transactionCategorySchema.default("other"),
  isSubscriptionProvider: z.boolean().default(false),
  negotiable: z.boolean().default(false),
  aliases: z.array(z.string().min(1).max(120)).max(200).default([]),
});
export type AdminCreateMerchantInput = z.input<typeof adminCreateMerchantSchema>;

export const adminUpdateMerchantSchema = adminCreateMerchantSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field is required",
  });
export type AdminUpdateMerchantInput = z.infer<typeof adminUpdateMerchantSchema>;

/** Append-only audit trail entry. */
export const auditLogSchema = z.object({
  id: z.string().uuid(),
  actorType: z.enum(["member", "admin", "system"]),
  actorId: z.string().uuid().nullable(),
  /** The affected member, when the action concerns one. */
  userId: z.string().uuid().nullable(),
  action: z.string().min(1),
  targetType: z.string().nullable(),
  targetId: z.string().uuid().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  ip: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AuditLogEntry = z.infer<typeof auditLogSchema>;

export const listAuditLogsQuerySchema = listQuerySchema.extend({
  action: z.string().min(1).max(60).optional(),
  memberId: z.string().uuid().optional(),
});
export type ListAuditLogsQuery = z.output<typeof listAuditLogsQuerySchema>;

import { z } from "zod";

export const accountTypeSchema = z.enum([
  "checking",
  "savings",
  "credit_card",
  "loan",
  "mortgage",
  "investment",
  "other",
]);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const accountConnectionStatusSchema = z.enum([
  "connected",
  "requires_reauth",
  "error",
  "revoked",
]);
export type AccountConnectionStatus = z.infer<typeof accountConnectionStatusSchema>;

/** Linked bank account as surfaced to members. Access is always read-only. */
export const accountSchema = z.object({
  id: z.string().uuid(),
  institutionId: z.string().nullable(),
  institutionName: z.string().min(1),
  name: z.string().min(1),
  type: accountTypeSchema,
  mask: z.string().length(4),
  /** Signed balance in cents (negative = owed on credit products). */
  balanceCents: z.number().int().nullable(),
  currency: z.string().length(3),
  status: accountConnectionStatusSchema,
  lastSyncedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Account = z.infer<typeof accountSchema>;

/** Aggregator handshake: exchange a public token for the linked accounts. */
export const linkAccountsRequestSchema = z.object({
  publicToken: z.string().min(8).max(512),
  institutionId: z.string().min(1).max(64).optional(),
});
export type LinkAccountsRequest = z.infer<typeof linkAccountsRequestSchema>;

export const linkAccountsResponseSchema = z.object({
  accounts: z.array(accountSchema),
});
export type LinkAccountsResponse = z.infer<typeof linkAccountsResponseSchema>;

/** Result of POST /accounts/:id/sync. */
export const syncAccountResponseSchema = z.object({
  accountId: z.string().uuid(),
  /** queued = accepted onto the sync queue; synced = ran inline (no Redis). */
  status: z.enum(["queued", "synced"]),
  /** Row counts; present when the sync ran inline, null when queued. */
  addedTransactions: z.number().int().min(0).nullable(),
  updatedTransactions: z.number().int().min(0).nullable(),
  removedTransactions: z.number().int().min(0).nullable(),
});
export type SyncAccountResponse = z.infer<typeof syncAccountResponseSchema>;

import { z } from "zod";
import { accountSchema } from "./account";

/**
 * Plaid Link handshake. The browser receives a short-lived link token,
 * runs Plaid Link, and hands back a single-use public token; the server
 * exchanges it for a long-lived access token. Credentials never touch
 * ReclaimR, and access is read-only by Plaid product scope.
 */

export const createLinkTokenResponseSchema = z.object({
  /** Pass to Plaid Link in the browser. */
  linkToken: z.string().min(16),
  /** ISO timestamp when the link token expires. */
  expiration: z.string().datetime(),
});
export type CreateLinkTokenResponse = z.infer<typeof createLinkTokenResponseSchema>;

export const exchangePublicTokenRequestSchema = z.object({
  /** Single-use token returned by a successful Plaid Link session. */
  publicToken: z.string().min(8).max(512),
  /** Plaid institution id (Link metadata); used for display when known. */
  institutionId: z.string().min(1).max(64).optional(),
  institutionName: z.string().min(1).max(120).optional(),
});
export type ExchangePublicTokenRequest = z.infer<typeof exchangePublicTokenRequestSchema>;

export const initialSyncSchema = z.object({
  /** queued = Redis/BullMQ picked it up; synced = ran inline (no Redis). */
  status: z.enum(["queued", "synced"]),
  /** Rows pulled on the first sync; null when the sync was queued. */
  addedTransactions: z.number().int().min(0).nullable(),
});
export type InitialSync = z.infer<typeof initialSyncSchema>;

export const exchangePublicTokenResponseSchema = z.object({
  accounts: z.array(accountSchema),
  initialSync: initialSyncSchema,
});
export type ExchangePublicTokenResponse = z.infer<typeof exchangePublicTokenResponseSchema>;

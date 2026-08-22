import { z } from "zod";
import { listQuerySchema } from "./pagination";

export const savingsKindSchema = z.enum([
  "subscription_canceled",
  "bill_negotiated",
  "fee_refunded",
  "manual_adjustment",
]);
export type SavingsKind = z.infer<typeof savingsKindSchema>;

/** Append-only ledger entry feeding the member's "reclaimed" counter. */
export const savingsEventSchema = z.object({
  id: z.string().uuid(),
  kind: savingsKindSchema,
  /** Amount reclaimed for the member; always positive. */
  amountCents: z.number().int().min(1),
  description: z.string().min(1).max(200),
  /** ISO date (YYYY-MM-DD) the saving was realized. */
  occurredAt: z.string().date(),
  sourceType: z.enum(["cancellation", "negotiation", "refund", "manual"]).nullable(),
  sourceId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export type SavingsEvent = z.infer<typeof savingsEventSchema>;

/** Members may add manual adjustments; system events are case-generated. */
export const createSavingsEventSchema = z.object({
  amountCents: z.number().int().min(1),
  description: z.string().min(1).max(200),
  occurredAt: z.string().date().optional(),
});
export type CreateSavingsEventInput = z.input<typeof createSavingsEventSchema>;

export const listSavingsEventsQuerySchema = listQuerySchema.extend({
  kind: savingsKindSchema.optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
export type ListSavingsEventsQuery = z.output<typeof listSavingsEventsQuerySchema>;

/** Aggregate view powering the dashboard's reclaimed counter. */
export const savingsSummarySchema = z.object({
  totalReclaimedCents: z.number().int().min(0),
  thisMonthCents: z.number().int().min(0),
  eventCount: z.number().int().min(0),
  byKind: z.array(
    z.object({
      kind: savingsKindSchema,
      amountCents: z.number().int().min(0),
    }),
  ),
});
export type SavingsSummary = z.infer<typeof savingsSummarySchema>;

import { z } from "zod";
import { caseStatusSchema, timelineEventSchema } from "./common";
import { listQuerySchema } from "./pagination";

/**
 * "Cancel this subscription for me" request handled by the concierge.
 * Lifecycle: submitted → in_review → in_progress → succeeded | failed;
 * the member can withdraw at any point before resolution (→ canceled).
 */
export const cancellationCaseSchema = z.object({
  id: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  /** Denormalized display name of the subscription at request time. */
  subscriptionName: z.string().min(1),
  /** Monthly-equivalent cost snapshot at request time, in cents. */
  monthlyAmountCents: z.number().int().min(0),
  status: caseStatusSchema,
  reason: z.string().max(500).nullable(),
  timeline: z.array(timelineEventSchema),
  requestedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  outcomeNote: z.string().max(500).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CancellationCase = z.infer<typeof cancellationCaseSchema>;

export const createCancellationSchema = z.object({
  subscriptionId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
export type CreateCancellationInput = z.infer<typeof createCancellationSchema>;

export const listCancellationsQuerySchema = listQuerySchema.extend({
  status: caseStatusSchema.optional(),
  subscriptionId: z.string().uuid().optional(),
});
export type ListCancellationsQuery = z.output<typeof listCancellationsQuerySchema>;

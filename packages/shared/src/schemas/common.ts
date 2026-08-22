import { z } from "zod";

/** Path/body parameter for every `:id` route. */
export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

/**
 * Lifecycle shared by concierge cases. Each case type uses a subset:
 *
 * - Cancellation: submitted → in_review → in_progress → succeeded|failed
 * - Negotiation:  submitted → in_review → in_progress → offer_pending →
 *                 succeeded (member approved) | failed (member rejected)
 *
 * The member can withdraw any unresolved case (→ canceled). `offer_pending`
 * is negotiation-only: it is the one state where the ball is in the member's
 * court, because we never book a success fee the member did not accept.
 * Transition legality lives in packages/core state machines.
 */
export const caseStatusSchema = z.enum([
  "submitted",
  "in_review",
  "in_progress",
  "offer_pending",
  "succeeded",
  "failed",
  "canceled",
]);
export type CaseStatus = z.infer<typeof caseStatusSchema>;

/** One entry in a case's append-only status timeline. */
export const timelineEventSchema = z.object({
  at: z.string().datetime(),
  status: caseStatusSchema,
  actor: z.enum(["member", "concierge", "system"]),
  note: z.string().max(1000).nullable(),
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

/**
 * Boolean query flag. `z.coerce.boolean()` would turn the string "false"
 * into `true`, so parse an explicit enum instead.
 */
export const booleanQuerySchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

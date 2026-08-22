import { z } from "zod";

/**
 * Wire contract for AI-generated content. Generation happens in the worker;
 * these shapes describe what the API hands back from the cache.
 *
 * Money rule (same as everywhere else): every `*Cents` value is an integer
 * computed server-side from the curated catalog. The model supplies ranking
 * and prose only — it never supplies a number that reaches a member.
 */

export const aiSuggestionKindSchema = z.enum([
  "alternative_advice",
  "alert_reasoning",
  "digest",
  "cancellation_plan",
  "negotiation_script",
]);
export type AiSuggestionKind = z.infer<typeof aiSuggestionKindSchema>;

/** One ranked alternative to a member's current subscription. */
export const alternativePickSchema = z.object({
  /** Catalog option id; null when the row was seeded as a demo fixture. */
  optionId: z.string().uuid().nullable(),
  name: z.string().min(1),
  monthlyPriceCents: z.number().int().min(0),
  /** Member's monthly-equivalent cost minus this option's monthly price. */
  monthlySavingsCents: z.number().int(),
  rationale: z.string(),
});
export type AlternativePick = z.infer<typeof alternativePickSchema>;

/** Structured content for kind = "alternative_advice". */
export const alternativeAdviceContentSchema = z.object({
  picks: z.array(alternativePickSchema),
  verdict: z.string(),
});
export type AlternativeAdviceContent = z.infer<typeof alternativeAdviceContentSchema>;

/** A cached AI artifact. `content` is kind-specific; parse it with the
 *  matching content schema before use. */
export const aiSuggestionSchema = z.object({
  id: z.string().uuid(),
  kind: aiSuggestionKindSchema,
  subjectType: z.string(),
  subjectId: z.string().uuid(),
  content: z.unknown(),
  summary: z.string().nullable(),
  /** Model identifier that produced this content ("mock" in dev/tests). */
  model: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AiSuggestion = z.infer<typeof aiSuggestionSchema>;

/** GET /subscriptions/:id/suggestions — `data` is null until generated. */
export const subscriptionSuggestionsResponseSchema = z.object({
  data: aiSuggestionSchema.nullable(),
});
export type SubscriptionSuggestionsResponse = z.infer<typeof subscriptionSuggestionsResponseSchema>;

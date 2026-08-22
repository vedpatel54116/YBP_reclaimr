import { z } from "zod";
import { listQuerySchema } from "./pagination";
import type { Paginated } from "../types/http";

export const subscriptionStatusSchema = z.enum([
  "active",
  "paused",
  "cancel_requested",
  "canceled",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const billingCadenceSchema = z.enum([
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "annual",
]);
export type BillingCadence = z.infer<typeof billingCadenceSchema>;

export const detectionSourceSchema = z.enum(["auto", "manual"]);
export type DetectionSource = z.infer<typeof detectionSourceSchema>;

/**
 * Full subscription record as returned by the API. `confidence` is non-null
 * only for auto-detected rows, which surface at or above the detection
 * confidence threshold (see DETECTION_CONFIDENCE_THRESHOLD in constants).
 */
export const subscriptionSchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid().nullable(),
  name: z.string().min(1).max(120),
  /** Money is always an integer amount of cents to avoid float drift. */
  amountCents: z.number().int().min(0),
  currency: z.string().length(3),
  cadence: billingCadenceSchema,
  status: subscriptionStatusSchema,
  /** ISO date (YYYY-MM-DD) of the next charge; informational once canceled. */
  nextBillingDate: z.string().date(),
  source: detectionSourceSchema,
  /** Detection confidence in [0, 1]; null for manually added rows. */
  confidence: z.number().min(0).max(1).nullable(),
  firstDetectedAt: z.string().datetime().nullable(),
  /** ISO date of the most recent observed charge, when known. */
  lastChargedAt: z.string().date().nullable(),
  /** Set when detection flags a same-merchant price level shift. */
  priceChangedAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

/** Payload for creating a manual subscription. */
export const createSubscriptionSchema = subscriptionSchema.pick({
  name: true,
  amountCents: true,
  cadence: true,
  nextBillingDate: true,
});
export type CreateSubscriptionInput = z.output<typeof createSubscriptionSchema>;

/** Payload for partially updating a subscription. */
export const updateSubscriptionSchema = subscriptionSchema
  .pick({
    name: true,
    amountCents: true,
    cadence: true,
    status: true,
    nextBillingDate: true,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field is required",
  });
export type UpdateSubscriptionInput = z.output<typeof updateSubscriptionSchema>;

export const listSubscriptionsQuerySchema = listQuerySchema.extend({
  status: subscriptionStatusSchema.optional(),
});
export type ListSubscriptionsQuery = z.output<typeof listSubscriptionsQuerySchema>;

export const paginatedSubscriptionSchema = z.object({
  data: z.array(subscriptionSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(1),
});
export type PaginatedSubscriptions = Paginated<Subscription>;

/** Result of running the detection engine over linked transactions. */
export const detectSubscriptionsResponseSchema = z.object({
  detected: z.number().int().min(0),
  updated: z.number().int().min(0),
  ranAt: z.string().datetime(),
});
export type DetectSubscriptionsResponse = z.infer<typeof detectSubscriptionsResponseSchema>;

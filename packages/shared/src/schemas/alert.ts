import { z } from "zod";
import { booleanQuerySchema } from "./common";
import { listQuerySchema } from "./pagination";

export const alertTypeSchema = z.enum([
  "low_balance",
  "large_purchase",
  "upcoming_bill",
  "price_increase",
  "new_subscription_detected",
  "subscription_canceled",
  "bank_connection_error",
]);
export type AlertType = z.infer<typeof alertTypeSchema>;

export const alertSeveritySchema = z.enum(["info", "warning"]);
export type AlertSeverity = z.infer<typeof alertSeveritySchema>;

/**
 * System-generated insight. Severity is displayed monochrome — via labels
 * and weight, never color.
 */
export const alertSchema = z.object({
  id: z.string().uuid(),
  type: alertTypeSchema,
  severity: alertSeveritySchema,
  title: z.string().min(1),
  body: z.string().min(1),
  /** Type-specific payload, e.g. { thresholdCents, actualCents }. */
  data: z.record(z.unknown()).nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Alert = z.infer<typeof alertSchema>;

export const listAlertsQuerySchema = listQuerySchema.extend({
  unreadOnly: booleanQuerySchema,
  type: alertTypeSchema.optional(),
});
export type ListAlertsQuery = z.output<typeof listAlertsQuerySchema>;

export const markAllReadResponseSchema = z.object({
  updated: z.number().int().min(0),
});
export type MarkAllReadResponse = z.infer<typeof markAllReadResponseSchema>;

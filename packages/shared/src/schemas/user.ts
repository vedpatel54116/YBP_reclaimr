import { z } from "zod";

export const consentTypeSchema = z.enum([
  "terms_of_service",
  "privacy_policy",
  "data_processing",
  "marketing_email",
]);
export type ConsentType = z.infer<typeof consentTypeSchema>;

/** Consent ledger entry (GDPR/CCPA); append-only. */
export const consentSchema = z.object({
  id: z.string().uuid(),
  type: consentTypeSchema,
  version: z.string().min(1),
  acceptedAt: z.string().datetime(),
  ip: z.string().nullable(),
});
export type Consent = z.infer<typeof consentSchema>;

export const recordConsentSchema = z.object({
  type: consentTypeSchema,
  version: z.string().min(1).max(40),
});
export type RecordConsentInput = z.infer<typeof recordConsentSchema>;

export const updateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** GDPR/CCPA data-export request; fulfilled asynchronously by a worker. */
export const exportRequestSchema = z.object({
  exportId: z.string().uuid(),
  status: z.enum(["pending", "ready", "failed"]),
  requestedAt: z.string().datetime(),
});
export type ExportRequest = z.infer<typeof exportRequestSchema>;

/** Account deletion is always soft-first, then enforced by a retention job. */
export const deletionResponseSchema = z.object({
  deletionScheduledAt: z.string().datetime(),
});
export type DeletionResponse = z.infer<typeof deletionResponseSchema>;

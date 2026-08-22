import { z } from "zod";
import {
  FEE_PERCENT_MAX,
  FEE_PERCENT_MIN,
  STATEMENT_CONTENT_TYPES,
  STATEMENT_MAX_BYTES,
} from "../constants";
import { caseStatusSchema, timelineEventSchema } from "./common";
import { listQuerySchema } from "./pagination";

/**
 * A statement the member uploaded to support a negotiation. Providers ask for
 * a recent bill before they will discuss a rate, so the concierge needs one
 * on file. The raw bytes never appear on this contract — only metadata and a
 * download route, because statements are read-only evidence.
 */
export const negotiationDocumentSchema = z.object({
  id: z.string().uuid(),
  negotiationCaseId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  contentType: z.enum(STATEMENT_CONTENT_TYPES),
  sizeBytes: z.number().int().min(1).max(STATEMENT_MAX_BYTES),
  uploadedAt: z.string().datetime(),
});
export type NegotiationDocument = z.infer<typeof negotiationDocumentSchema>;

/**
 * "Negotiate this bill down" request. The success fee is
 * feePercent × confirmedAnnualSavingsCents and is charged only after the
 * member approves the rate the concierge secured — never on the projection
 * shown at submit time, and never without an explicit approval.
 */
export const negotiationCaseSchema = z.object({
  id: z.string().uuid(),
  billId: z.string().uuid(),
  /** Denormalized display name of the bill at request time. */
  billName: z.string().min(1),
  status: caseStatusSchema,
  /** User-chosen success fee share, 35–60 (%). */
  feePercent: z.number().int().min(FEE_PERCENT_MIN).max(FEE_PERCENT_MAX),
  projectedAnnualSavingsCents: z.number().int().min(0).nullable(),
  /**
   * The rate the concierge actually secured, presented to the member for
   * approval. Set when the case enters `offer_pending`.
   */
  offeredAnnualSavingsCents: z.number().int().min(0).nullable(),
  /** Concierge's description of the offer (new rate, term, conditions). */
  offerNote: z.string().max(1000).nullable(),
  offeredAt: z.string().datetime().nullable(),
  /** When the member approved or rejected the offer. */
  offerRespondedAt: z.string().datetime().nullable(),
  /** Locked in from the offer once the member approves. */
  confirmedAnnualSavingsCents: z.number().int().min(0).nullable(),
  /** feePercent × confirmedAnnualSavingsCents, computed on approval. */
  feeAmountCents: z.number().int().min(0).nullable(),
  /** Savings the member keeps: confirmed − fee. Null until approval. */
  netAnnualSavingsCents: z.number().int().min(0).nullable(),
  /** Statements on file for the concierge. */
  documents: z.array(negotiationDocumentSchema),
  timeline: z.array(timelineEventSchema),
  requestedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  outcomeNote: z.string().max(500).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type NegotiationCase = z.infer<typeof negotiationCaseSchema>;

export const createNegotiationSchema = z.object({
  billId: z.string().uuid(),
  feePercent: z.number().int().min(FEE_PERCENT_MIN).max(FEE_PERCENT_MAX),
});
export type CreateNegotiationInput = z.infer<typeof createNegotiationSchema>;

/** Member's response to an offer. A rejection is free and always allowed. */
export const respondToOfferSchema = z.object({
  note: z.string().max(500).optional(),
});
export type RespondToOfferInput = z.infer<typeof respondToOfferSchema>;

export const listNegotiationsQuerySchema = listQuerySchema.extend({
  status: caseStatusSchema.optional(),
  billId: z.string().uuid().optional(),
});
export type ListNegotiationsQuery = z.output<typeof listNegotiationsQuerySchema>;

/**
 * Concierge cases: cancellations and bill negotiations.
 *
 * A case is a state machine with a fully transparent, event-by-event timeline
 * (the trust moat — no black box). Cases carry notes and uploaded documents,
 * and reference the e-sign consent that authorizes ReclaimR to act.
 */
import type {
  AdminUserId,
  CalendarDateString,
  CaseId,
  CaseNoteId,
  ConsentRecordId,
  DocumentUploadId,
  ISODateString,
  NegotiationOfferId,
  SubscriptionId,
  TimelineEventId,
  BillId,
  UserId,
} from './common.js';
import {
  ActorType,
  CancellationMethod,
  CaseStatus,
  DocumentStatus,
  NegotiationOfferStatus,
  NegotiationOutcome,
} from './enums.js';

/** One entry on a case's public timeline. Every status change appends one. */
export interface CaseTimelineEvent {
  id: TimelineEventId;
  caseId: CaseId;
  actor: ActorType;
  /** Short machine-stable label, e.g. `submitted`, `provider_contacted`. */
  event: string;
  /** Human-readable detail rendered in the timeline UI. */
  detail: string | null;
  occurredAt: ISODateString;
}

/** A note attached to a case by the user, a staff member, or the system. */
export interface CaseNote {
  id: CaseNoteId;
  caseId: CaseId;
  authorId: UserId | AdminUserId;
  authorType: ActorType;
  body: string;
  /** Internal notes are visible to staff only — never rendered to the member. */
  isInternal: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString | null;
}

/** A document (bill statement, confirmation letter, ...) attached to a case. */
export interface DocumentUpload {
  id: DocumentUploadId;
  caseId: CaseId;
  uploadedBy: UserId | AdminUserId;
  uploaderType: ActorType;
  fileName: string;
  /** MIME type, e.g. `application/pdf`. */
  contentType: string;
  sizeBytes: number;
  /** SHA-256 of the file content, verified on retrieval. */
  checksumSha256: string;
  /**
   * Private object-store key. Documents are never exposed at public URLs;
   * access goes through short-lived authenticated links.
   */
  storageKey: string;
  status: DocumentStatus;
  scannedAt: ISODateString | null;
  createdAt: ISODateString;
  /** Soft-deleted at the user's request or by retention policy. */
  deletedAt: ISODateString | null;
}

/**
 * A concierge cancellation request for one detected subscription.
 * Premium-gated; free users get the self-serve guide instead.
 */
export interface CancellationCase {
  id: CaseId;
  userId: UserId;
  subscriptionId: SubscriptionId;
  status: CaseStatus;
  method: CancellationMethod;
  /** E-sign authorization to act on the user's behalf for this case. */
  consentRecordId: ConsentRecordId;
  /** Monthly run-rate reclaimed once the cancellation is confirmed. */
  monthlySavingsCents: number;
  /** Provider's cancellation confirmation reference, when issued. */
  confirmationRef: string | null;
  /** Date the provider confirmed the service actually ends. */
  effectiveDate: CalendarDateString | null;
  requestedAt: ISODateString;
  completedAt: ISODateString | null;
  timeline: CaseTimelineEvent[];
  notes: CaseNote[];
  documents: DocumentUpload[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** A single offer exchanged during a negotiation; providers may counter. */
export interface NegotiationOffer {
  id: NegotiationOfferId;
  caseId: CaseId;
  status: NegotiationOfferStatus;
  /** Recurring amount the provider would charge under this offer. */
  proposedAmountCents: number;
  /** True when the provider presents the offer as best-and-final. */
  isFinal: boolean;
  submittedAt: ISODateString;
  expiresAt: ISODateString | null;
  resolvedAt: ISODateString | null;
}

/**
 * A concierge bill-negotiation request. Free to request; the success fee is
 * charged ONLY on a confirmed win — never upfront on projections.
 */
export interface NegotiationCase {
  id: CaseId;
  userId: UserId;
  billId: BillId;
  status: CaseStatus;
  /** Result once the case completes; null while in flight. */
  outcome: NegotiationOutcome | null;
  /** E-sign authorization to act on the user's behalf for this case. */
  consentRecordId: ConsentRecordId;
  /**
   * Success-fee share of first-year savings chosen on the 35–60% slider,
   * stored as a fraction (0.35–0.60).
   */
  feePercent: number;
  /** Estimate shown before submission. Never billed against. */
  projectedAnnualSavingsCents: number;
  /** Confirmed first-year savings after the provider accepts an offer. */
  negotiatedAnnualSavingsCents: number | null;
  /** feePercent × negotiatedAnnualSavingsCents — computed on confirmed win only. */
  feeAmountCents: number | null;
  feeChargedAt: ISODateString | null;
  offers: NegotiationOffer[];
  timeline: CaseTimelineEvent[];
  notes: CaseNote[];
  documents: DocumentUpload[];
  requestedAt: ISODateString;
  completedAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

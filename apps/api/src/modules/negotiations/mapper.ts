import type {
  NegotiationCase as PrismaNegotiationCase,
  NegotiationDocument as PrismaNegotiationDocument,
  Prisma,
} from "@prisma/client";
import type { NegotiationCase, NegotiationDocument, TimelineEvent } from "@reclaimr/shared";
import { STATEMENT_CONTENT_TYPES } from "@reclaimr/shared";

export type NegotiationCaseRow = PrismaNegotiationCase & {
  bill: { name: string };
  documents: PrismaNegotiationDocument[];
};

export const NEGOTIATION_INCLUDE = {
  bill: { select: { name: true } },
  documents: { orderBy: { uploadedAt: "asc" } },
} as const satisfies Prisma.NegotiationCaseInclude;

/** Prisma stores case timelines as Json; narrow once at the boundary. */
export function toTimeline(value: unknown): TimelineEvent[] {
  return Array.isArray(value) ? (value as TimelineEvent[]) : [];
}

export function toJsonTimeline(timeline: readonly TimelineEvent[]): Prisma.InputJsonValue {
  return timeline as unknown as Prisma.InputJsonValue;
}

/**
 * `contentType` is stored as free text (the column is TEXT) but the upload path
 * only ever admits values from the allowlist, so narrowing here is safe. A row
 * predating a shrunk allowlist falls back to a generic type rather than
 * failing the whole response.
 */
function toContentType(value: string): NegotiationDocument["contentType"] {
  return (STATEMENT_CONTENT_TYPES as readonly string[]).includes(value)
    ? (value as NegotiationDocument["contentType"])
    : "application/pdf";
}

export function toNegotiationDocument(row: PrismaNegotiationDocument): NegotiationDocument {
  return {
    id: row.id,
    negotiationCaseId: row.negotiationCaseId,
    filename: row.filename,
    contentType: toContentType(row.contentType),
    sizeBytes: row.sizeBytes,
    uploadedAt: row.uploadedAt.toISOString(),
  };
}

export function toNegotiationCase(row: NegotiationCaseRow): NegotiationCase {
  return {
    id: row.id,
    billId: row.billId,
    billName: row.bill.name,
    status: row.status,
    feePercent: row.feePercent,
    projectedAnnualSavingsCents: row.projectedAnnualSavingsCents,
    offeredAnnualSavingsCents: row.offeredAnnualSavingsCents,
    offerNote: row.offerNote,
    offeredAt: row.offeredAt?.toISOString() ?? null,
    offerRespondedAt: row.offerRespondedAt?.toISOString() ?? null,
    confirmedAnnualSavingsCents: row.confirmedAnnualSavingsCents,
    feeAmountCents: row.feeAmountCents,
    // Derived rather than stored: one subtraction cannot drift out of sync,
    // whereas a third money column could.
    netAnnualSavingsCents:
      row.confirmedAnnualSavingsCents === null || row.feeAmountCents === null
        ? null
        : row.confirmedAnnualSavingsCents - row.feeAmountCents,
    documents: row.documents.map(toNegotiationDocument),
    timeline: toTimeline(row.timeline),
    requestedAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    outcomeNote: row.outcomeNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

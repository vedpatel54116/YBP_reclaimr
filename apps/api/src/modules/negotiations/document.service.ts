import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { isTerminalCaseStatus } from "@reclaimr/core";
import {
  STATEMENT_CONTENT_TYPES,
  STATEMENT_MAX_BYTES,
  STATEMENT_MAX_PER_CASE,
  type NegotiationDocument,
} from "@reclaimr/shared";
import type { StorageAdapter } from "../../adapters/storage";
import { badRequest, conflict, notFound } from "../../lib/errors";
import type { AuditService, RequestContext } from "../../services/audit";
import { toNegotiationDocument } from "./mapper";

export interface UploadedStatement {
  /** Client-supplied name; used for display only, never for the storage path. */
  filename: string;
  contentType: string;
  bytes: Buffer;
}

export interface DownloadedStatement {
  filename: string;
  contentType: string;
  bytes: Buffer;
}

/** Extension per accepted content type — derived from the type, not the name. */
const EXTENSIONS: Record<(typeof STATEMENT_CONTENT_TYPES)[number], string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function isAcceptedContentType(value: string): value is (typeof STATEMENT_CONTENT_TYPES)[number] {
  return (STATEMENT_CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * Keep a recognizable display name without trusting it. Path separators,
 * leading dots, quotes, and control characters are removed because this string
 * is echoed back to clients and written into a Content-Disposition header.
 *
 * Filtering by code point rather than a regex keeps the intent legible: anything
 * below 0x20, plus DEL, is not a filename character.
 */
function safeDisplayName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "statement";
  const cleaned = [...base]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f && char !== '"';
    })
    .join("")
    .replace(/^\.+/, "");
  return cleaned.slice(0, 200) || "statement";
}

/**
 * Statements members upload so the concierge can quote a provider.
 *
 * Providers will not discuss a rate without a recent bill, so these files are
 * the difference between a negotiation that can proceed and one that cannot.
 * They are also among the most sensitive data in the product — a full account
 * statement — so every read is ownership-checked and storage keys are
 * userId-prefixed.
 */
export class NegotiationDocumentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageAdapter,
    private readonly audit: AuditService,
  ) {}

  async upload(
    userId: string,
    caseId: string,
    file: UploadedStatement,
    ctx: RequestContext,
  ): Promise<NegotiationDocument> {
    const negotiation = await this.prisma.negotiationCase.findFirst({
      where: { id: caseId, userId },
      select: { id: true, status: true, _count: { select: { documents: true } } },
    });
    if (!negotiation) throw notFound("Negotiation case not found");

    // Evidence for a closed case changes nothing and would only confuse the
    // audit trail about what informed the outcome.
    if (isTerminalCaseStatus(negotiation.status)) {
      throw conflict("This negotiation is already resolved", "CASE_RESOLVED");
    }
    if (negotiation._count.documents >= STATEMENT_MAX_PER_CASE) {
      throw conflict(
        `A case may hold at most ${STATEMENT_MAX_PER_CASE} statements`,
        "TOO_MANY_DOCUMENTS",
      );
    }
    if (!isAcceptedContentType(file.contentType)) {
      throw badRequest(
        `Statements must be one of: ${STATEMENT_CONTENT_TYPES.join(", ")}`,
        "UNSUPPORTED_CONTENT_TYPE",
      );
    }
    if (file.bytes.byteLength === 0) {
      throw badRequest("The uploaded file is empty", "FILE_EMPTY");
    }
    // The multipart parser also caps this; re-checking here means the limit
    // holds for any future caller that is not an HTTP upload.
    if (file.bytes.byteLength > STATEMENT_MAX_BYTES) {
      throw badRequest("Statements must be 10MB or smaller", "FILE_TOO_LARGE");
    }

    // Server-generated and userId-prefixed: a leaked key cannot address another
    // member's statement, and the client's filename never reaches the path.
    const storageKey = `negotiations/${userId}/${caseId}/${randomUUID()}.${EXTENSIONS[file.contentType]}`;
    const checksum = createHash("sha256").update(file.bytes).digest("hex");

    // Bytes first, metadata second. If the insert fails we can delete the
    // object; the reverse order would leave a row pointing at nothing, which
    // reads as data loss to the member and to the concierge working the case.
    await this.storage.put(storageKey, file.bytes, file.contentType);

    let row;
    try {
      row = await this.prisma.negotiationDocument.create({
        data: {
          userId,
          negotiationCaseId: caseId,
          filename: safeDisplayName(file.filename),
          contentType: file.contentType,
          sizeBytes: file.bytes.byteLength,
          storageKey,
          checksum,
        },
      });
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: userId,
      userId,
      action: "negotiation.document_uploaded",
      targetType: "negotiation_document",
      targetId: row.id,
      metadata: { negotiationCaseId: caseId, sizeBytes: row.sizeBytes, checksum },
    });

    return toNegotiationDocument(row);
  }

  async list(userId: string, caseId: string): Promise<NegotiationDocument[]> {
    const negotiation = await this.prisma.negotiationCase.findFirst({
      where: { id: caseId, userId },
      select: { id: true },
    });
    if (!negotiation) throw notFound("Negotiation case not found");

    const rows = await this.prisma.negotiationDocument.findMany({
      where: { negotiationCaseId: caseId, userId },
      orderBy: { uploadedAt: "asc" },
    });
    return rows.map(toNegotiationDocument);
  }

  /**
   * Stream a statement back to its owner. A document belonging to someone else
   * yields 404, not 403: a 403 would confirm that the id exists, which is more
   * than a stranger should learn about another member's files.
   */
  async download(userId: string, caseId: string, documentId: string): Promise<DownloadedStatement> {
    const row = await this.prisma.negotiationDocument.findFirst({
      where: { id: documentId, negotiationCaseId: caseId, userId },
    });
    if (!row) throw notFound("Statement not found");

    const bytes = await this.storage.get(row.storageKey);
    return { filename: row.filename, contentType: row.contentType, bytes };
  }
}

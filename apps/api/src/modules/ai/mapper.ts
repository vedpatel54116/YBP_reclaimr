import type { AiSuggestion as AiSuggestionRow } from "@prisma/client";
import type { AiSuggestion } from "@reclaimr/shared";

/** Persistence row → wire shape. Dates become ISO strings; absent prose is
 *  null (never undefined) per the wire convention. */
export function toAiSuggestion(row: AiSuggestionRow): AiSuggestion {
  return {
    id: row.id,
    kind: row.kind,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    content: row.content ?? null,
    summary: row.summary,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

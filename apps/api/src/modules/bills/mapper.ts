import type { Bill as PrismaBill } from "@prisma/client";
import type { Bill } from "@reclaimr/shared";

/** Prisma row → shared domain shape. Absent data becomes null, never undefined. */
export function toBill(row: PrismaBill): Bill {
  return {
    id: row.id,
    merchantId: row.merchantId,
    connectedAccountId: row.connectedAccountId,
    name: row.name,
    category: row.category,
    expectedAmountCents: row.expectedAmountCents,
    lastAmountCents: row.lastAmountCents,
    dueDay: row.dueDay,
    cadence: row.cadence,
    autopay: row.autopay,
    negotiable: row.negotiable,
    isActive: row.isActive,
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

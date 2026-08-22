import type { Transaction } from "@prisma/client";
import type { Transaction as TransactionDto } from "@reclaimr/shared";

/** Prisma row → shared Transaction shape. */
export function toTransaction(row: Transaction): TransactionDto {
  return {
    id: row.id,
    accountId: row.accountId,
    merchantId: row.merchantId,
    merchantName: row.merchantName,
    amountCents: row.amountCents,
    category: row.category,
    isRecurring: row.isRecurring,
    isPending: row.isPending,
    note: row.note,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

import type { ConnectedAccount } from "@prisma/client";
import type { Account } from "@reclaimr/shared";

/** Prisma row → shared Account shape. */
export function toAccount(row: ConnectedAccount): Account {
  return {
    id: row.id,
    institutionId: row.institutionId,
    institutionName: row.institutionName,
    name: row.name,
    type: row.type,
    mask: row.mask,
    balanceCents: row.balanceCents,
    currency: row.currency,
    status: row.status,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** "YYYY-MM-DD" → UTC-midnight Date for DATE columns. */
export function dateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Date → UTC-midnight Date for DATE columns. */
export function dateOnlyFromDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

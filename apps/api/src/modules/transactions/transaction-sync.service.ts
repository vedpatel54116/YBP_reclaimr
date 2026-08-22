import type { PrismaClient, Transaction } from "@prisma/client";
import { transactionCategorySchema, type TransactionCategory } from "@reclaimr/shared";
import type { PlaidTransactionView } from "../../adapters/plaid";
import { PlaidAdapterError, type PlaidAdapter } from "../../adapters/plaid";
import type { TokenCipher } from "../../adapters/crypto/token-cipher";
import { notFound } from "../../lib/errors";
import type { MerchantNormalizationService } from "../detection/merchant-normalization.service";
import { effectiveCategory } from "../detection/merchant-normalization.service";
import type { AlertService } from "../alerts/alert.service";

/** Trust an aggregator category hint only when it is a known category. */
function safeCategoryHint(hint: string | null): TransactionCategory | null {
  if (!hint) return null;
  const parsed = transactionCategorySchema.safeParse(hint);
  return parsed.success ? parsed.data : null;
}

export interface SyncResult {
  plaidItemId: string;
  added: number;
  updated: number;
  removed: number;
  /** True when the adapter says the member must re-authenticate. */
  requiresReauth: boolean;
}

/** Guard against pathological page loops (Plaid caps out far below this). */
const MAX_SYNC_PAGES = 50;

/**
 * Transaction syncing: cursor-based incremental pulls over Plaid
 * /transactions/sync. Every step is idempotent —
 *   - rows dedupe on externalId (unique),
 *   - the cursor is persisted after each applied page, so a retry resumes
 *     exactly where it stopped and re-applied pages are no-ops,
 *   - re-auth failures mark the item (and its accounts) requires_reauth and
 *     raise a connection alert instead of silently failing.
 */
export class TransactionSyncService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly adapter: PlaidAdapter,
    private readonly cipher: TokenCipher,
    private readonly merchants: MerchantNormalizationService,
    private readonly alerts: AlertService,
  ) {}

  async syncItem(plaidItemId: string, now: Date = new Date()): Promise<SyncResult> {
    const item = await this.prisma.plaidItem.findUnique({
      where: { id: plaidItemId },
      include: { accounts: true },
    });
    if (!item) throw notFound("Plaid item not found");

    const accessToken = this.cipher.decrypt(item.accessTokenEnc);
    const result: SyncResult = {
      plaidItemId,
      added: 0,
      updated: 0,
      removed: 0,
      requiresReauth: false,
    };

    try {
      await this.refreshBalances(item.id, item.userId, accessToken);

      // Map aggregator account ids → local rows for this item.
      const accountByExternalId = new Map(
        (
          await this.prisma.connectedAccount.findMany({
            where: { plaidItemId: item.id },
            select: { id: true, externalAccountId: true },
          })
        )
          .filter((a) => a.externalAccountId !== null)
          .map((a) => [a.externalAccountId as string, a.id]),
      );

      let cursor = item.syncCursor;
      let hasMore = true;
      for (let page = 0; hasMore && page < MAX_SYNC_PAGES; page++) {
        const syncPage = await this.adapter.syncTransactions(accessToken, cursor);
        const applied = await this.applyPage(item.userId, syncPage, accountByExternalId);
        result.added += applied.added;
        result.updated += applied.updated;
        result.removed += applied.removed;
        cursor = syncPage.nextCursor ?? cursor;
        await this.prisma.plaidItem.update({
          where: { id: item.id },
          data: { syncCursor: cursor },
        });
        hasMore = syncPage.hasMore;
      }

      await this.prisma.plaidItem.update({
        where: { id: item.id },
        data: { lastSyncedAt: now, status: "connected", lastSyncError: null },
      });
      await this.prisma.connectedAccount.updateMany({
        where: { plaidItemId: item.id },
        data: { lastSyncedAt: now, status: "connected" },
      });
      return result;
    } catch (error) {
      await this.recordSyncError(item.id, item.userId, error);
      throw error;
    }
  }

  private async refreshBalances(
    itemId: string,
    userId: string,
    accessToken: string,
  ): Promise<void> {
    const view = await this.adapter.getAccounts(accessToken);
    for (const account of view.accounts) {
      await this.prisma.connectedAccount.upsert({
        where: {
          plaidItemId_externalAccountId: {
            plaidItemId: itemId,
            externalAccountId: account.externalAccountId,
          },
        },
        create: {
          userId,
          plaidItemId: itemId,
          externalAccountId: account.externalAccountId,
          institutionId: view.institutionId,
          institutionName: view.institutionName ?? "Linked Institution",
          name: account.name,
          type: account.type,
          mask: account.mask,
          balanceCents: account.balanceCents,
          currency: account.currency,
        },
        update: {
          name: account.name,
          mask: account.mask,
          balanceCents: account.balanceCents,
          status: "connected",
        },
      });
    }
  }

  private async applyPage(
    userId: string,
    page: { added: PlaidTransactionView[]; modified: PlaidTransactionView[]; removed: string[] },
    accountByExternalId: Map<string, string>,
  ): Promise<{ added: number; updated: number; removed: number }> {
    // Resolve merchants once for the whole page (one upsert per distinct key).
    const names = [...page.added, ...page.modified].map((t) => t.merchantName);
    const resolutions = await this.merchants.resolveMany(names);

    let added = 0;
    let updated = 0;
    let removed = 0;

    for (const view of page.added) {
      const accountId = accountByExternalId.get(view.externalAccountId);
      if (!accountId) continue; // account not exposed by getAccounts; skip defensively
      const resolution = resolutions.get(view.merchantName);
      if (!resolution) continue;
      const existing = await this.prisma.transaction.findUnique({
        where: { externalId: view.externalId },
        select: { id: true },
      });
      if (existing) continue; // already ingested — replays are no-ops
      await this.prisma.transaction.create({
        data: {
          userId,
          accountId,
          externalId: view.externalId,
          merchantId: resolution.merchantId,
          merchantName: view.merchantName,
          amountCents: view.amountCents,
          category: effectiveCategory(resolution.category, safeCategoryHint(view.categoryHint)),
          isPending: view.isPending,
          occurredAt: view.occurredAt,
        },
      });
      added += 1;
    }

    for (const view of page.modified) {
      const resolution = resolutions.get(view.merchantName);
      const row: Transaction | null = await this.prisma.transaction
        .update({
          where: { externalId: view.externalId },
          data: {
            amountCents: view.amountCents,
            isPending: view.isPending,
            ...(resolution && resolution.category !== "other"
              ? { category: resolution.category }
              : {}),
          },
        })
        .catch(() => null);
      if (row) updated += 1;
    }

    if (page.removed.length > 0) {
      const deletion = await this.prisma.transaction.deleteMany({
        where: { externalId: { in: page.removed }, userId },
      });
      removed += deletion.count;
    }

    return { added, updated, removed };
  }

  private async recordSyncError(itemId: string, userId: string, error: unknown): Promise<void> {
    const isReauth = error instanceof PlaidAdapterError && error.kind === "reauth";
    const status = isReauth ? "requires_reauth" : "error";
    const message = error instanceof Error ? error.message : "Unknown sync error";
    await this.prisma.plaidItem
      .update({ where: { id: itemId }, data: { status, lastSyncError: message.slice(0, 500) } })
      .catch(() => null);
    await this.prisma.connectedAccount
      .updateMany({ where: { plaidItemId: itemId }, data: { status } })
      .catch(() => null);

    if (isReauth) {
      // Fire-and-forget alert; the alert service dedupes on its own key.
      await this.alerts
        .record(userId, {
          type: "bank_connection_error",
          severity: "warning",
          title: "Bank connection needs attention",
          body: "A linked institution needs re-authentication. Reconnect it in Settings to resume syncing.",
          dedupKey: `bank_connection_error:${itemId}`,
          data: { plaidItemId: itemId },
        })
        .catch(() => undefined);
    }
  }
}

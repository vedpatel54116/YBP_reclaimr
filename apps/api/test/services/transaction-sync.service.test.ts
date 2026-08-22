import { beforeEach, describe, expect, it } from "vitest";
import { PlaidAdapterError, type PlaidTransactionView } from "../../src/adapters/plaid";
import { TokenCipher } from "../../src/adapters/crypto/token-cipher";
import { AlertService } from "../../src/modules/alerts/alert.service";
import { MerchantNormalizationService } from "../../src/modules/detection/merchant-normalization.service";
import { TransactionSyncService } from "../../src/modules/transactions/transaction-sync.service";
import { createFakePrisma, type FakePrisma } from "../support/fake-prisma";
import { ScriptedPlaidAdapter } from "../support/scripted-plaid-adapter";

/**
 * Transaction syncing. The property that matters most is idempotency: the
 * worker retries with exponential backoff and Plaid redelivers webhooks, so
 * the same page can be applied more than once and must not duplicate rows or
 * lose the cursor.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-08-22T12:00:00.000Z");
const ACCESS_TOKEN = "access-sandbox-test";
const EXTERNAL_ACCOUNT = "acc_checking_0001";

const cipher = new TokenCipher("test-encryption-secret-at-least-16-chars");

let db: FakePrisma;
let adapter: ScriptedPlaidAdapter;
let sync: TransactionSyncService;
let itemId: string;

function accountsResult(balanceCents = 250_000) {
  return {
    institutionId: "ins_test",
    institutionName: "Test Bank",
    accounts: [
      {
        externalAccountId: EXTERNAL_ACCOUNT,
        name: "Premier Checking",
        type: "checking" as const,
        mask: "4521",
        balanceCents,
        availableCents: balanceCents,
        currency: "USD",
      },
    ],
  };
}

function txn(overrides: Partial<PlaidTransactionView> = {}): PlaidTransactionView {
  return {
    externalId: "txn-1",
    externalAccountId: EXTERNAL_ACCOUNT,
    occurredAt: new Date("2026-08-20T12:00:00.000Z"),
    merchantName: "NETFLIX.COM",
    amountCents: 1_799,
    isPending: false,
    categoryHint: null,
    ...overrides,
  };
}

beforeEach(async () => {
  db = createFakePrisma();
  adapter = new ScriptedPlaidAdapter().setAccounts(accountsResult());
  sync = new TransactionSyncService(
    db.asPrisma(),
    adapter,
    cipher,
    new MerchantNormalizationService(db.asPrisma()),
    new AlertService(db.asPrisma()),
  );

  const item = await db.plaidItem.create({
    data: {
      userId: USER,
      externalItemId: "item-test",
      accessTokenEnc: cipher.encrypt(ACCESS_TOKEN),
      institutionName: "Test Bank",
    },
  });
  itemId = item.id as string;
});

describe("TransactionSyncService.syncItem", () => {
  it("throws when the item does not exist", async () => {
    await expect(sync.syncItem("00000000-0000-4000-8000-000000000000", NOW)).rejects.toThrow(
      /not found/i,
    );
  });

  it("creates accounts from balances before applying transactions", async () => {
    adapter.queuePage({ added: [txn()], nextCursor: "cursor-1" });

    const result = await sync.syncItem(itemId, NOW);

    expect(result.added).toBe(1);
    expect(db.connectedAccount.rows).toHaveLength(1);
    expect(db.connectedAccount.rows[0]).toMatchObject({
      userId: USER,
      plaidItemId: itemId,
      externalAccountId: EXTERNAL_ACCOUNT,
      name: "Premier Checking",
      balanceCents: 250_000,
    });
    expect(db.transaction.rows[0]).toMatchObject({
      userId: USER,
      externalId: "txn-1",
      merchantName: "NETFLIX.COM",
      amountCents: 1_799,
    });
  });

  it("resolves the transaction onto a canonical merchant with its category", async () => {
    adapter.queuePage({ added: [txn()], nextCursor: "cursor-1" });

    await sync.syncItem(itemId, NOW);

    const merchant = db.merchant.rows[0];
    expect(merchant).toMatchObject({
      normalizedKey: "netflix",
      canonicalName: "Netflix",
      isSubscriptionProvider: true,
    });
    expect(db.transaction.rows[0]?.merchantId).toBe(merchant?.id);
    // The curated merchant category wins over the (absent) aggregator hint.
    expect(db.transaction.rows[0]?.category).toBe("entertainment");
  });

  it("prefers the curated merchant category over an aggregator hint", async () => {
    adapter.queuePage({ added: [txn({ categoryHint: "shopping" })], nextCursor: "c1" });

    await sync.syncItem(itemId, NOW);

    expect(db.transaction.rows[0]?.category).toBe("entertainment");
  });

  it("falls back to the aggregator hint for an uncatalogued merchant", async () => {
    adapter.queuePage({
      added: [txn({ merchantName: "JOE CORNER BODEGA", categoryHint: "groceries" })],
      nextCursor: "c1",
    });

    await sync.syncItem(itemId, NOW);

    expect(db.transaction.rows[0]?.category).toBe("groceries");
  });

  it("ignores an aggregator hint that is not a known category", async () => {
    adapter.queuePage({
      added: [txn({ merchantName: "JOE CORNER BODEGA", categoryHint: "NOT_A_CATEGORY" })],
      nextCursor: "c1",
    });

    await sync.syncItem(itemId, NOW);

    expect(db.transaction.rows[0]?.category).toBe("other");
  });

  it("persists the cursor and reports the item connected", async () => {
    adapter.queuePage({ added: [txn()], nextCursor: "cursor-1" });

    await sync.syncItem(itemId, NOW);

    const item = await db.plaidItem.findUnique({ where: { id: itemId } });
    expect(item).toMatchObject({
      syncCursor: "cursor-1",
      status: "connected",
      lastSyncError: null,
      lastSyncedAt: NOW,
    });
    expect(db.connectedAccount.rows[0]?.lastSyncedAt).toEqual(NOW);
  });

  it("follows hasMore across pages, passing each nextCursor forward", async () => {
    adapter
      .queuePage({ added: [txn({ externalId: "txn-1" })], nextCursor: "cursor-1", hasMore: true })
      .queuePage({ added: [txn({ externalId: "txn-2" })], nextCursor: "cursor-2", hasMore: true })
      .queuePage({ added: [txn({ externalId: "txn-3" })], nextCursor: "cursor-3", hasMore: false });

    const result = await sync.syncItem(itemId, NOW);

    expect(result.added).toBe(3);
    expect(adapter.cursorsSeen).toEqual([null, "cursor-1", "cursor-2"]);
    expect(db.transaction.rows).toHaveLength(3);
    expect((await db.plaidItem.findUnique({ where: { id: itemId } }))?.syncCursor).toBe("cursor-3");
  });

  it("resumes from the stored cursor on a later run", async () => {
    await db.plaidItem.update({ where: { id: itemId }, data: { syncCursor: "cursor-9" } });
    adapter.queuePage({ added: [txn()], nextCursor: "cursor-10" });

    await sync.syncItem(itemId, NOW);

    expect(adapter.cursorsSeen).toEqual(["cursor-9"]);
  });

  // ─── Idempotency ─────────────────────────────────────────────────────────

  it("re-applying the same page adds nothing (externalId dedupe)", async () => {
    adapter.queuePage({ added: [txn()], nextCursor: "cursor-1" });
    const first = await sync.syncItem(itemId, NOW);
    expect(first.added).toBe(1);

    // A retry that replays the identical page.
    const replay = new ScriptedPlaidAdapter().setAccounts(accountsResult());
    replay.queuePage({ added: [txn()], nextCursor: "cursor-1" });
    const second = new TransactionSyncService(
      db.asPrisma(),
      replay,
      cipher,
      new MerchantNormalizationService(db.asPrisma()),
      new AlertService(db.asPrisma()),
    );

    const result = await second.syncItem(itemId, NOW);

    expect(result.added).toBe(0);
    expect(db.transaction.rows).toHaveLength(1);
  });

  it("does not duplicate accounts or merchants across runs", async () => {
    adapter.queuePage({ added: [txn()], nextCursor: "cursor-1" });
    await sync.syncItem(itemId, NOW);
    await sync.syncItem(itemId, NOW);

    expect(db.connectedAccount.rows).toHaveLength(1);
    expect(db.merchant.rows).toHaveLength(1);
  });

  it("keeps the cursor from pages applied before a mid-pagination failure", async () => {
    adapter
      .queuePage({ added: [txn({ externalId: "txn-1" })], nextCursor: "cursor-1", hasMore: true })
      .failOnSyncCall(1, new PlaidAdapterError("network", "connection reset"));

    await expect(sync.syncItem(itemId, NOW)).rejects.toThrow(/connection reset/);

    // Page 1 landed and its cursor was persisted, so the retry does not
    // re-download or re-apply it.
    expect(db.transaction.rows).toHaveLength(1);
    const item = await db.plaidItem.findUnique({ where: { id: itemId } });
    expect(item?.syncCursor).toBe("cursor-1");
    expect(item?.status).toBe("error");
  });

  // ─── Modified / removed ──────────────────────────────────────────────────

  it("applies modified transactions to existing rows", async () => {
    adapter.queuePage({ added: [txn({ isPending: true, amountCents: 1_549 })], nextCursor: "c1" });
    await sync.syncItem(itemId, NOW);

    const settle = new ScriptedPlaidAdapter().setAccounts(accountsResult());
    settle.queuePage({
      modified: [txn({ isPending: false, amountCents: 1_799 })],
      nextCursor: "c2",
    });
    const result = await new TransactionSyncService(
      db.asPrisma(),
      settle,
      cipher,
      new MerchantNormalizationService(db.asPrisma()),
      new AlertService(db.asPrisma()),
    ).syncItem(itemId, NOW);

    expect(result.updated).toBe(1);
    expect(db.transaction.rows).toHaveLength(1);
    expect(db.transaction.rows[0]).toMatchObject({ amountCents: 1_799, isPending: false });
  });

  it("ignores a modification for a transaction it never ingested", async () => {
    adapter.queuePage({ modified: [txn({ externalId: "txn-unknown" })], nextCursor: "c1" });

    const result = await sync.syncItem(itemId, NOW);

    expect(result.updated).toBe(0);
    expect(db.transaction.rows).toHaveLength(0);
  });

  it("deletes removed transactions", async () => {
    adapter.queuePage({ added: [txn()], nextCursor: "c1" });
    await sync.syncItem(itemId, NOW);

    const removal = new ScriptedPlaidAdapter().setAccounts(accountsResult());
    removal.queuePage({ removed: ["txn-1"], nextCursor: "c2" });
    const result = await new TransactionSyncService(
      db.asPrisma(),
      removal,
      cipher,
      new MerchantNormalizationService(db.asPrisma()),
      new AlertService(db.asPrisma()),
    ).syncItem(itemId, NOW);

    expect(result.removed).toBe(1);
    expect(db.transaction.rows).toHaveLength(0);
  });

  it("skips transactions for accounts the item does not expose", async () => {
    adapter.queuePage({
      added: [txn({ externalAccountId: "acc_not_in_getaccounts" })],
      nextCursor: "c1",
    });

    const result = await sync.syncItem(itemId, NOW);

    expect(result.added).toBe(0);
    expect(db.transaction.rows).toHaveLength(0);
  });

  // ─── Failure handling ────────────────────────────────────────────────────

  it("marks the item requires_reauth and alerts the member on a reauth error", async () => {
    adapter.failGetAccountsWith(
      new PlaidAdapterError("reauth", "login required", "ITEM_LOGIN_REQUIRED"),
    );

    await expect(sync.syncItem(itemId, NOW)).rejects.toThrow(/login required/);

    const item = await db.plaidItem.findUnique({ where: { id: itemId } });
    expect(item).toMatchObject({ status: "requires_reauth", lastSyncError: "login required" });
    expect(db.alert.rows).toHaveLength(1);
    expect(db.alert.rows[0]).toMatchObject({
      userId: USER,
      type: "bank_connection_error",
      severity: "warning",
    });
  });

  it("marks the item error (not requires_reauth) on a transient failure", async () => {
    adapter.failGetAccountsWith(new PlaidAdapterError("network", "socket hang up"));

    await expect(sync.syncItem(itemId, NOW)).rejects.toThrow(/socket hang up/);

    expect((await db.plaidItem.findUnique({ where: { id: itemId } }))?.status).toBe("error");
    // A transient blip must not nag the member to reconnect.
    expect(db.alert.rows).toHaveLength(0);
  });

  it("does not repeat the reauth alert while the first is unread", async () => {
    adapter.failGetAccountsWith(new PlaidAdapterError("reauth", "login required"));

    await expect(sync.syncItem(itemId, NOW)).rejects.toThrow();
    await expect(sync.syncItem(itemId, NOW)).rejects.toThrow();
    await expect(sync.syncItem(itemId, NOW)).rejects.toThrow();

    expect(db.alert.rows).toHaveLength(1);
  });

  it("clears a previous error once a sync succeeds", async () => {
    await db.plaidItem.update({
      where: { id: itemId },
      data: { status: "error", lastSyncError: "socket hang up" },
    });
    adapter.queuePage({ added: [txn()], nextCursor: "c1" });

    await sync.syncItem(itemId, NOW);

    expect(await db.plaidItem.findUnique({ where: { id: itemId } })).toMatchObject({
      status: "connected",
      lastSyncError: null,
    });
  });

  it("truncates a very long provider error message", async () => {
    adapter.failGetAccountsWith(new Error("x".repeat(900)));

    await expect(sync.syncItem(itemId, NOW)).rejects.toThrow();

    const item = await db.plaidItem.findUnique({ where: { id: itemId } });
    expect((item?.lastSyncError as string).length).toBe(500);
  });
});

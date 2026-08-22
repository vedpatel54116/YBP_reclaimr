import { beforeEach, describe, expect, it } from "vitest";
import { TokenCipher } from "../../src/adapters/crypto/token-cipher";
import { AccountService } from "../../src/modules/accounts/account.service";
import { PlaidLinkService } from "../../src/modules/accounts/plaid-link.service";
import { createFakePrisma, type FakePrisma } from "../support/fake-prisma";
import { ScriptedPlaidAdapter } from "../support/scripted-plaid-adapter";

/**
 * Account linking. Two properties carry real risk here: the access token must
 * never be stored in plaintext, and re-running Link for an institution the
 * member already connected must not fork a second item or duplicate accounts.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";

const cipher = new TokenCipher("test-encryption-secret-at-least-16-chars");

let db: FakePrisma;
let adapter: ScriptedPlaidAdapter;
let link: PlaidLinkService;
let accounts: AccountService;

function accountsResult(overrides: { institutionName?: string | null } = {}) {
  return {
    institutionId: "ins_109508",
    // `??` would swallow an explicit null, which is the case under test.
    institutionName: "institutionName" in overrides ? overrides.institutionName! : "Chase",
    accounts: [
      {
        externalAccountId: "acc_checking",
        name: "Premier Checking",
        type: "checking" as const,
        mask: "4521",
        balanceCents: 250_000,
        availableCents: 240_000,
        currency: "USD",
      },
      {
        externalAccountId: "acc_card",
        name: "Platinum Card",
        type: "credit_card" as const,
        mask: "3312",
        balanceCents: -94_213,
        availableCents: null,
        currency: "USD",
      },
    ],
  };
}

beforeEach(() => {
  db = createFakePrisma();
  adapter = new ScriptedPlaidAdapter().setAccounts(accountsResult());
  link = new PlaidLinkService(db.asPrisma(), adapter, cipher);
  accounts = new AccountService(db.asPrisma());
});

describe("PlaidLinkService.createLinkToken", () => {
  it("returns the token and its expiration", async () => {
    const result = await link.createLinkToken(USER);

    expect(result.linkToken).toBe(`link-sandbox-${USER}`);
    expect(result.expiration).toBe("2026-08-22T16:00:00.000Z");
  });
});

describe("PlaidLinkService.exchange", () => {
  it("persists the item and all of its accounts", async () => {
    const result = await link.exchange(USER, { publicToken: "public-abc" });

    expect(db.plaidItem.rows).toHaveLength(1);
    expect(db.plaidItem.rows[0]).toMatchObject({
      userId: USER,
      externalItemId: "item-public-abc",
      institutionId: "ins_109508",
      institutionName: "Chase",
      status: "connected",
    });
    expect(result.accounts).toHaveLength(2);
    expect(db.connectedAccount.rows).toHaveLength(2);
  });

  it("encrypts the access token at rest and never returns it", async () => {
    const result = await link.exchange(USER, { publicToken: "public-abc" });

    const stored = db.plaidItem.rows[0]?.accessTokenEnc as string;
    expect(stored).not.toContain("access-public-abc");
    expect(stored.startsWith("v1.")).toBe(true);
    // Only the server key can recover it.
    expect(cipher.decrypt(stored)).toBe("access-public-abc");
    expect(JSON.stringify(result)).not.toContain("access-public-abc");
  });

  it("maps balances and masks onto the returned accounts", async () => {
    const result = await link.exchange(USER, { publicToken: "public-abc" });

    expect(result.accounts[0]).toMatchObject({
      name: "Premier Checking",
      type: "checking",
      mask: "4521",
      balanceCents: 250_000,
      institutionName: "Chase",
    });
    expect(result.accounts[1]).toMatchObject({ type: "credit_card", balanceCents: -94_213 });
  });

  it("prefers a caller-supplied institution name over the adapter's", async () => {
    await link.exchange(USER, {
      publicToken: "public-abc",
      institutionId: "ins_custom",
      institutionName: "Chase Bank, N.A.",
    });

    expect(db.plaidItem.rows[0]).toMatchObject({
      institutionId: "ins_custom",
      institutionName: "Chase Bank, N.A.",
    });
  });

  it("falls back to a generic label when no name is available", async () => {
    adapter.setAccounts(accountsResult({ institutionName: null }));

    await link.exchange(USER, { publicToken: "public-abc" });

    expect(db.plaidItem.rows[0]?.institutionName).toBe("Linked Institution");
  });

  // ─── Idempotency ─────────────────────────────────────────────────────────

  it("replaying the same public token reuses the item and accounts", async () => {
    const first = await link.exchange(USER, { publicToken: "public-abc" });
    const second = await link.exchange(USER, { publicToken: "public-abc" });

    expect(second.plaidItemId).toBe(first.plaidItemId);
    expect(db.plaidItem.rows).toHaveLength(1);
    expect(db.connectedAccount.rows).toHaveLength(2);
  });

  it("rotates the stored token when an item is re-linked", async () => {
    await link.exchange(USER, { publicToken: "public-abc" });
    const firstToken = db.plaidItem.rows[0]?.accessTokenEnc;

    // Simulate a re-auth: same item id, but Plaid issues a fresh access token.
    const relinkAdapter = new ScriptedPlaidAdapter().setAccounts(accountsResult());
    relinkAdapter.exchangePublicToken = async (publicToken: string) => ({
      accessToken: `access-rotated-${publicToken}`,
      itemId: "item-public-abc",
    });
    await new PlaidLinkService(db.asPrisma(), relinkAdapter, cipher).exchange(USER, {
      publicToken: "public-xyz",
    });

    const rotated = db.plaidItem.rows[0]?.accessTokenEnc as string;
    expect(rotated).not.toBe(firstToken);
    expect(cipher.decrypt(rotated)).toBe("access-rotated-public-xyz");
    expect(db.plaidItem.rows).toHaveLength(1);
  });

  it("clears a prior error and reconnects on re-link", async () => {
    await link.exchange(USER, { publicToken: "public-abc" });
    await db.plaidItem.updateMany({
      where: { userId: USER },
      data: { status: "requires_reauth", lastSyncError: "login required" },
    });

    await link.exchange(USER, { publicToken: "public-abc" });

    expect(db.plaidItem.rows[0]).toMatchObject({
      status: "connected",
      lastSyncError: null,
    });
  });

  it("refreshes account identity and balance on re-link", async () => {
    await link.exchange(USER, { publicToken: "public-abc" });

    const renamed = accountsResult();
    renamed.accounts[0]!.name = "Premier Checking Plus";
    renamed.accounts[0]!.balanceCents = 310_000;
    adapter.setAccounts(renamed);
    await link.exchange(USER, { publicToken: "public-abc" });

    expect(db.connectedAccount.rows).toHaveLength(2);
    const checking = db.connectedAccount.rows.find((r) => r.externalAccountId === "acc_checking");
    expect(checking).toMatchObject({ name: "Premier Checking Plus", balanceCents: 310_000 });
  });

  it("rejects an item already linked to a different member", async () => {
    await link.exchange(OTHER_USER, { publicToken: "public-abc" });

    await expect(link.exchange(USER, { publicToken: "public-abc" })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(db.plaidItem.rows).toHaveLength(1);
    expect(db.plaidItem.rows[0]?.userId).toBe(OTHER_USER);
  });
});

describe("AccountService", () => {
  beforeEach(async () => {
    await link.exchange(USER, { publicToken: "public-abc" });
  });

  it("lists a member's accounts with pagination metadata", async () => {
    const page = await accounts.list(USER, { page: 1, pageSize: 20 });

    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
    expect(page.data).toHaveLength(2);
  });

  it("paginates", async () => {
    const first = await accounts.list(USER, { page: 1, pageSize: 1 });
    const second = await accounts.list(USER, { page: 2, pageSize: 1 });

    expect(first.data).toHaveLength(1);
    expect(second.data).toHaveLength(1);
    expect(first.totalPages).toBe(2);
    expect(first.data[0]?.id).not.toBe(second.data[0]?.id);
  });

  it("reports one page even when a member has no accounts", async () => {
    const page = await accounts.list(OTHER_USER, { page: 1, pageSize: 20 });

    expect(page).toMatchObject({ total: 0, totalPages: 1 });
    expect(page.data).toEqual([]);
  });

  it("never exposes another member's accounts", async () => {
    const page = await accounts.list(OTHER_USER, { page: 1, pageSize: 20 });
    expect(page.data).toEqual([]);

    const target = db.connectedAccount.rows[0]?.id as string;
    expect(await accounts.get(OTHER_USER, target)).toBeNull();
    expect(await accounts.get(USER, target)).not.toBeNull();
  });

  it("resolves the owning Plaid item for a sync request", async () => {
    const accountId = db.connectedAccount.rows[0]?.id as string;
    const itemId = db.plaidItem.rows[0]?.id as string;

    expect(await accounts.findItemIdForAccount(USER, accountId)).toBe(itemId);
    // Scoped: another member cannot reach it.
    expect(await accounts.findItemIdForAccount(OTHER_USER, accountId)).toBeNull();
  });

  it("returns null for an unknown account id", async () => {
    expect(
      await accounts.findItemIdForAccount(USER, "00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
  });
});

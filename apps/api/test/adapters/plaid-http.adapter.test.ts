import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaidAdapterError } from "../../src/adapters/plaid";
import { PlaidHttpAdapter } from "../../src/adapters/plaid/http-adapter";

/**
 * The real Plaid adapter, driven against a stubbed fetch. This is the layer
 * that translates Plaid's wire format into ReclaimR's conventions (integer
 * cents, our sign convention, our account taxonomy) and classifies failures
 * into retryable vs re-auth — both easy to get subtly wrong and impossible to
 * cover with the deterministic mock adapter.
 */

interface StubCall {
  path: string;
  body: Record<string, unknown>;
}

let calls: StubCall[];
let adapter: PlaidHttpAdapter;

/** Route responses by Plaid path; unrouted paths fail the test loudly. */
function stubFetch(routes: Record<string, { status?: number; body: unknown }>): void {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    calls.push({ path, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    const route = routes[path];
    if (!route) throw new Error(`unstubbed Plaid path: ${path}`);
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
}

const ACCOUNTS_BODY = {
  accounts: [
    {
      account_id: "acc_checking",
      name: "Premier Checking",
      official_name: null,
      type: "depository",
      subtype: "checking",
      mask: "4521",
      balances: { current: 2500.5, available: 2400.25, iso_currency_code: "USD" },
    },
  ],
  item: { institution_id: "ins_109508" },
};

beforeEach(() => {
  calls = [];
  adapter = new PlaidHttpAdapter({ clientId: "cid", secret: "sec", env: "sandbox" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlaidHttpAdapter.getAccounts", () => {
  it("converts dollars to integer cents", async () => {
    stubFetch({
      "/accounts/get": { body: ACCOUNTS_BODY },
      "/institutions/get_by_id": { body: { institution: { name: "Chase" } } },
    });

    const result = await adapter.getAccounts("access-token");

    expect(result.accounts[0]).toMatchObject({
      externalAccountId: "acc_checking",
      name: "Premier Checking",
      type: "checking",
      mask: "4521",
      balanceCents: 250_050,
      availableCents: 240_025,
      currency: "USD",
    });
  });

  it("negates credit balances (Plaid reports owed as positive)", async () => {
    stubFetch({
      "/accounts/get": {
        body: {
          accounts: [
            {
              account_id: "acc_card",
              name: "Platinum Card",
              official_name: null,
              type: "credit",
              subtype: "credit card",
              mask: "3312",
              balances: { current: 942.13, available: null, iso_currency_code: "USD" },
            },
          ],
          item: { institution_id: null },
        },
      },
    });

    const result = await adapter.getAccounts("access-token");

    expect(result.accounts[0]?.type).toBe("credit_card");
    expect(result.accounts[0]?.balanceCents).toBe(-94_213);
  });

  it("maps Plaid account taxonomy onto ReclaimR account types", async () => {
    const cases: Array<[string, string | null, string]> = [
      ["depository", "checking", "checking"],
      ["depository", "savings", "savings"],
      ["credit", "credit card", "credit_card"],
      ["loan", "student", "loan"],
      ["loan", "mortgage", "mortgage"],
      ["investment", "ira", "investment"],
      ["brokerage", null, "investment"],
      ["something_new", null, "other"],
    ];

    for (const [type, subtype, expected] of cases) {
      calls = [];
      stubFetch({
        "/accounts/get": {
          body: {
            accounts: [
              {
                account_id: "acc",
                name: "Account",
                official_name: null,
                type,
                subtype,
                mask: "0001",
                balances: { current: 10, available: null, iso_currency_code: "USD" },
              },
            ],
            item: { institution_id: null },
          },
        },
      });

      const result = await adapter.getAccounts("access-token");
      expect(result.accounts[0]?.type, `${type}/${subtype}`).toBe(expected);
    }
  });

  it("falls back through official_name then a generic label", async () => {
    stubFetch({
      "/accounts/get": {
        body: {
          accounts: [
            {
              account_id: "a",
              name: null,
              official_name: "Total Checking",
              type: "depository",
              subtype: "checking",
              mask: null,
              balances: { current: null, available: null, iso_currency_code: null },
            },
            {
              account_id: "b",
              name: null,
              official_name: null,
              type: "depository",
              subtype: "checking",
              mask: null,
              balances: { current: null, available: null, iso_currency_code: null },
            },
          ],
          item: { institution_id: null },
        },
      },
    });

    const result = await adapter.getAccounts("access-token");

    expect(result.accounts[0]).toMatchObject({
      name: "Total Checking",
      mask: "0000",
      balanceCents: null,
      currency: "USD",
    });
    expect(result.accounts[1]?.name).toBe("Unnamed account");
  });

  // ─── Institution name resolution ──────────────────────────────────────────

  it("resolves the institution display name", async () => {
    stubFetch({
      "/accounts/get": { body: ACCOUNTS_BODY },
      "/institutions/get_by_id": { body: { institution: { name: "Chase" } } },
    });

    const result = await adapter.getAccounts("access-token");

    expect(result.institutionId).toBe("ins_109508");
    expect(result.institutionName).toBe("Chase");
    expect(calls.map((c) => c.path)).toEqual(["/accounts/get", "/institutions/get_by_id"]);
    expect(calls[1]?.body).toMatchObject({
      institution_id: "ins_109508",
      country_codes: ["US"],
    });
  });

  it("caches the institution lookup across syncs", async () => {
    stubFetch({
      "/accounts/get": { body: ACCOUNTS_BODY },
      "/institutions/get_by_id": { body: { institution: { name: "Chase" } } },
    });

    await adapter.getAccounts("access-token");
    await adapter.getAccounts("access-token");
    await adapter.getAccounts("access-token");

    const lookups = calls.filter((c) => c.path === "/institutions/get_by_id");
    expect(lookups).toHaveLength(1);
  });

  it("skips the lookup when the item has no institution", async () => {
    stubFetch({
      "/accounts/get": { body: { ...ACCOUNTS_BODY, item: { institution_id: null } } },
    });

    const result = await adapter.getAccounts("access-token");

    expect(result.institutionName).toBeNull();
    expect(calls.map((c) => c.path)).toEqual(["/accounts/get"]);
  });

  it("still returns accounts when the institution lookup fails", async () => {
    stubFetch({
      "/accounts/get": { body: ACCOUNTS_BODY },
      "/institutions/get_by_id": {
        status: 400,
        body: { error_code: "INSTITUTION_NOT_FOUND", error_message: "no such institution" },
      },
    });

    const result = await adapter.getAccounts("access-token");

    // The name is presentation only — losing it must not fail the sync.
    expect(result.institutionName).toBeNull();
    expect(result.accounts).toHaveLength(1);
  });
});

describe("PlaidHttpAdapter.syncTransactions", () => {
  it("maps a sync page into ReclaimR's transaction view", async () => {
    stubFetch({
      "/transactions/sync": {
        body: {
          added: [
            {
              transaction_id: "txn_1",
              account_id: "acc_checking",
              date: "2026-08-20",
              name: "NETFLIX.COM 405882 RE",
              merchant_name: "Netflix",
              amount: 17.99,
              pending: false,
            },
          ],
          modified: [],
          removed: [{ transaction_id: "txn_gone" }],
          next_cursor: "cursor-abc",
          has_more: true,
        },
      },
    });

    const page = await adapter.syncTransactions("access-token", null);

    expect(page.added[0]).toMatchObject({
      externalId: "txn_1",
      externalAccountId: "acc_checking",
      merchantName: "Netflix",
      amountCents: 1_799,
      isPending: false,
      categoryHint: null,
    });
    // Noon UTC keeps date-only values on the intended calendar day worldwide.
    expect(page.added[0]?.occurredAt.toISOString()).toBe("2026-08-20T12:00:00.000Z");
    expect(page.removed).toEqual(["txn_gone"]);
    expect(page.nextCursor).toBe("cursor-abc");
    expect(page.hasMore).toBe(true);
  });

  it("prefers the raw statement name when Plaid has no merchant_name", async () => {
    stubFetch({
      "/transactions/sync": {
        body: {
          added: [
            {
              transaction_id: "txn_1",
              account_id: "acc",
              date: "2026-08-20",
              name: "SQ *CORNER COFFEE",
              merchant_name: null,
              amount: 4.5,
              pending: null,
            },
          ],
          modified: [],
          removed: [],
          next_cursor: null,
          has_more: false,
        },
      },
    });

    const page = await adapter.syncTransactions("access-token", null);

    expect(page.added[0]?.merchantName).toBe("SQ *CORNER COFFEE");
    expect(page.added[0]?.isPending).toBe(false);
  });

  it("omits the cursor on a first sync and sends it afterwards", async () => {
    const body = {
      added: [],
      modified: [],
      removed: [],
      next_cursor: "c1",
      has_more: false,
    };
    stubFetch({ "/transactions/sync": { body } });

    await adapter.syncTransactions("access-token", null);
    await adapter.syncTransactions("access-token", "c1");

    expect(calls[0]?.body.cursor).toBeUndefined();
    expect(calls[1]?.body.cursor).toBe("c1");
  });
});

describe("PlaidHttpAdapter error classification", () => {
  it("classifies item login errors as reauth", async () => {
    stubFetch({
      "/accounts/get": {
        status: 400,
        body: { error_code: "ITEM_LOGIN_REQUIRED", error_message: "login required" },
      },
    });

    await expect(adapter.getAccounts("access-token")).rejects.toMatchObject({
      name: "PlaidAdapterError",
      kind: "reauth",
      code: "ITEM_LOGIN_REQUIRED",
    });
  });

  it("classifies bad credentials as invalid", async () => {
    stubFetch({
      "/accounts/get": {
        status: 400,
        body: { error_code: "INVALID_API_KEYS", error_message: "bad keys" },
      },
    });

    await expect(adapter.getAccounts("access-token")).rejects.toMatchObject({
      kind: "invalid",
    });
  });

  it("classifies an unrecognised Plaid code as unknown", async () => {
    stubFetch({
      "/accounts/get": {
        status: 500,
        body: { error_code: "INTERNAL_SERVER_ERROR", error_message: "boom" },
      },
    });

    await expect(adapter.getAccounts("access-token")).rejects.toMatchObject({
      kind: "unknown",
    });
  });

  it("classifies a transport failure as network", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("ECONNRESET")));

    const error = await adapter.getAccounts("access-token").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PlaidAdapterError);
    expect(error).toMatchObject({ kind: "network" });
  });

  it("sends credentials on every call without leaking them into the path", async () => {
    stubFetch({
      "/link/token/create": {
        body: { link_token: "link-abc", expiration: "2026-08-22T16:00:00Z" },
      },
    });

    const token = await adapter.createLinkToken({ userId: "user-1" });

    expect(token).toEqual({ linkToken: "link-abc", expiration: "2026-08-22T16:00:00Z" });
    expect(calls[0]?.body).toMatchObject({
      client_id: "cid",
      secret: "sec",
      products: ["transactions"],
      country_codes: ["US"],
      user: { client_user_id: "user-1" },
    });
  });
});

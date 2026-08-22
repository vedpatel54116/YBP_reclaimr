import { describe, expect, it } from "vitest";
import { MockPlaidAdapter } from "../../src/adapters/plaid/mock-adapter";
import type { PlaidSyncPage } from "../../src/adapters/plaid/types";

const NOW = new Date("2026-08-22T12:00:00.000Z");

function adapter(): MockPlaidAdapter {
  return new MockPlaidAdapter(() => NOW);
}

async function accessToken(): Promise<string> {
  const exchange = await adapter().exchangePublicToken("public-sandbox-demo-token");
  return exchange.accessToken;
}

async function pullAll(token: string): Promise<PlaidSyncPage[]> {
  const a = adapter();
  const pages: PlaidSyncPage[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) {
    const page = await a.syncTransactions(token, cursor);
    pages.push(page);
    cursor = page.nextCursor;
    if (!page.hasMore) break;
  }
  return pages;
}

describe("MockPlaidAdapter", () => {
  it("exchanges public tokens deterministically", async () => {
    const first = await adapter().exchangePublicToken("public-token-x");
    const second = await adapter().exchangePublicToken("public-token-x");
    const other = await adapter().exchangePublicToken("public-token-y");
    expect(first).toEqual(second);
    expect(first.itemId).not.toBe(other.itemId);
  });

  it("returns well-formed accounts with signed balances", async () => {
    const result = await adapter().getAccounts(await accessToken());
    expect(result.institutionName).toBeTruthy();
    expect(result.accounts.length).toBeGreaterThanOrEqual(2);
    const checking = result.accounts.find((a) => a.type === "checking");
    const credit = result.accounts.find((a) => a.type === "credit_card");
    expect(checking?.balanceCents).toBeGreaterThan(0);
    expect(credit?.balanceCents).toBeLessThan(0); // negative = owed
  });

  it("paginates the full history and terminates", async () => {
    const pages = await pullAll(await accessToken());
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[pages.length - 1]!.hasMore).toBe(false);
    const total = pages.reduce((acc, page) => acc + page.added.length, 0);
    expect(total).toBeGreaterThan(150); // ~10 months of activity
  });

  it("is deterministic: same token + same clock → identical history", async () => {
    const token = await accessToken();
    const first = await pullAll(token);
    const second = await pullAll(token);
    const key = (pages: PlaidSyncPage[]) =>
      pages.flatMap((p) => p.added.map((t) => `${t.externalId}:${t.amountCents}`));
    expect(key(second)).toEqual(key(first));
  });

  it("serves incremental pages from a stored cursor (no duplicates)", async () => {
    const token = await accessToken();
    const a = adapter();
    const first = await a.syncTransactions(token, null);
    const all = await pullAll(token);
    // Resume from the first page's cursor over a fresh pull: same continuation.
    const rest = await adapter().syncTransactions(token, first.nextCursor);
    const fullIds = all.flatMap((p) => p.added.map((t) => t.externalId));
    const restIds = rest.added.map((t) => t.externalId);
    expect(restIds.every((id) => fullIds.includes(id))).toBe(true);
    expect(new Set(fullIds).size).toBe(fullIds.length); // globally unique ids
  });

  it("contains the recurring patterns the detection engine must find", async () => {
    const pages = await pullAll(await accessToken());
    const names = new Set(pages.flatMap((p) => p.added.map((t) => t.merchantName)));
    expect(names.has("NETFLIX.COM 405882 RE")).toBe(true);
    expect(names.has("COMCAST *XFINITY INTERNET")).toBe(true);
    expect(names.has("CONSOLIDATED EDISON")).toBe(true);
    expect(names.has("GEICO AUTO 1234")).toBe(true);
    // Netflix price hike present in the amounts.
    const netflix = pages.flatMap((p) => p.added.filter((t) => t.merchantName.includes("NETFLIX")));
    expect(new Set(netflix.map((t) => t.amountCents))).toEqual(new Set([1549, 1799]));
  });

  it("restarts cleanly from a garbage cursor (idempotent replays)", async () => {
    const token = await accessToken();
    const page = await adapter().syncTransactions(token, "garbage-cursor");
    expect(page.added.length).toBeGreaterThan(0);
  });
});

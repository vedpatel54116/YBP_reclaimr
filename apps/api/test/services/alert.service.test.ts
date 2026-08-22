import { beforeEach, describe, expect, it } from "vitest";
import type { AlertDraft } from "@reclaimr/core";
import { AlertService } from "../../src/modules/alerts/alert.service";
import { createFakePrisma, type FakePrisma } from "../support/fake-prisma";

/**
 * Alert persistence + dedup. The rules themselves are pure and covered in
 * @reclaimr/core; what is tested here is the part that can spam a member:
 * deduplication against already-unread alerts.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-08-22T12:00:00.000Z");

let db: FakePrisma;
let alerts: AlertService;

beforeEach(() => {
  db = createFakePrisma();
  alerts = new AlertService(db.asPrisma());
});

function draft(overrides: Partial<AlertDraft> = {}): AlertDraft {
  return {
    type: "low_balance",
    severity: "warning",
    title: "Low balance",
    body: "Checking dropped to $12.00.",
    dedupKey: "low_balance:acct-1:1200",
    data: { accountId: "acct-1" },
    ...overrides,
  };
}

describe("AlertService.record", () => {
  it("creates the alert and stores the dedupKey in data", async () => {
    expect(await alerts.record(USER, draft())).toBe(true);

    expect(db.alert.rows).toHaveLength(1);
    expect(db.alert.rows[0]).toMatchObject({
      userId: USER,
      type: "low_balance",
      severity: "warning",
    });
    expect((db.alert.rows[0]?.data as Record<string, unknown>).dedupKey).toBe(
      "low_balance:acct-1:1200",
    );
  });

  it("suppresses a re-fire of the same dedupKey", async () => {
    await alerts.record(USER, draft());
    expect(await alerts.record(USER, draft())).toBe(false);
    expect(db.alert.rows).toHaveLength(1);
  });

  it("still fires when the same key was already read", async () => {
    await alerts.record(USER, draft());
    await db.alert.updateMany({ where: { userId: USER }, data: { readAt: NOW } });

    expect(await alerts.record(USER, draft())).toBe(true);
    expect(db.alert.rows).toHaveLength(2);
  });

  it("fires for a different key of the same type", async () => {
    await alerts.record(USER, draft());
    expect(await alerts.record(USER, draft({ dedupKey: "low_balance:acct-2:900" }))).toBe(true);
    expect(db.alert.rows).toHaveLength(2);
  });

  /**
   * Regression: dedup must consider *every* unread alert of the type, not an
   * arbitrary one. With two accounts low at once, the already-recorded alert
   * for acct-2 must not let the acct-1 alert through a second time.
   */
  it("dedupes against all unread alerts of the type, not just the first", async () => {
    await alerts.record(USER, draft({ dedupKey: "low_balance:acct-1:1200" }));
    await alerts.record(USER, draft({ dedupKey: "low_balance:acct-2:900" }));
    expect(db.alert.rows).toHaveLength(2);

    expect(await alerts.record(USER, draft({ dedupKey: "low_balance:acct-1:1200" }))).toBe(false);
    expect(await alerts.record(USER, draft({ dedupKey: "low_balance:acct-2:900" }))).toBe(false);
    expect(db.alert.rows).toHaveLength(2);
  });

  it("scopes dedup per member", async () => {
    const other = "22222222-2222-4222-8222-222222222222";
    await alerts.record(USER, draft());
    expect(await alerts.record(other, draft())).toBe(true);
    expect(db.alert.rows).toHaveLength(2);
  });
});

describe("AlertService.recordMany", () => {
  it("returns 0 and writes nothing for an empty batch", async () => {
    expect(await alerts.recordMany(USER, [])).toBe(0);
    expect(db.alert.rows).toHaveLength(0);
  });

  it("creates only the drafts not already unread", async () => {
    await alerts.record(USER, draft({ dedupKey: "low_balance:acct-1:1200" }));

    const created = await alerts.recordMany(USER, [
      draft({ dedupKey: "low_balance:acct-1:1200" }),
      draft({ dedupKey: "low_balance:acct-2:900" }),
    ]);

    expect(created).toBe(1);
    expect(db.alert.rows).toHaveLength(2);
  });

  it("dedupes within a single batch", async () => {
    const created = await alerts.recordMany(USER, [draft(), draft(), draft()]);

    expect(created).toBe(1);
    expect(db.alert.rows).toHaveLength(1);
  });
});

describe("AlertService.evaluateUser", () => {
  it("raises a low-balance alert for a cash account under the threshold", async () => {
    await db.connectedAccount.create({
      data: {
        userId: USER,
        institutionName: "Test Bank",
        name: "Everyday Checking",
        type: "checking",
        mask: "4521",
        balanceCents: 1_200,
      },
    });

    expect(await alerts.evaluateUser(USER, NOW)).toBe(1);
    expect(db.alert.rows[0]).toMatchObject({ type: "low_balance", severity: "warning" });
  });

  it("ignores credit accounts and healthy balances", async () => {
    await db.connectedAccount.create({
      data: {
        userId: USER,
        institutionName: "Test Bank",
        name: "Platinum Card",
        type: "credit_card",
        mask: "3312",
        balanceCents: -90_000,
      },
    });
    await db.connectedAccount.create({
      data: {
        userId: USER,
        institutionName: "Test Bank",
        name: "Savings",
        type: "savings",
        mask: "8890",
        balanceCents: 400_000,
      },
    });

    expect(await alerts.evaluateUser(USER, NOW)).toBe(0);
  });

  it("raises a large-purchase alert only for recent outgoing charges", async () => {
    const account = await db.connectedAccount.create({
      data: {
        userId: USER,
        institutionName: "Test Bank",
        name: "Everyday Checking",
        type: "checking",
        mask: "4521",
        balanceCents: 500_000,
      },
    });

    // Recent and large → alerts.
    await db.transaction.create({
      data: {
        userId: USER,
        accountId: account.id,
        externalId: "txn-recent-large",
        merchantName: "BIG TICKET APPLIANCES",
        amountCents: 99_900,
        occurredAt: new Date("2026-08-20T12:00:00.000Z"),
      },
    });
    // Same size but outside the 7-day window → ignored.
    await db.transaction.create({
      data: {
        userId: USER,
        accountId: account.id,
        externalId: "txn-old-large",
        merchantName: "BIG TICKET APPLIANCES",
        amountCents: 99_900,
        occurredAt: new Date("2026-07-01T12:00:00.000Z"),
      },
    });
    // Incoming money (negative) → never a "purchase".
    await db.transaction.create({
      data: {
        userId: USER,
        accountId: account.id,
        externalId: "txn-payroll",
        merchantName: "ACME PAYROLL",
        amountCents: -260_000,
        occurredAt: new Date("2026-08-21T12:00:00.000Z"),
      },
    });

    expect(await alerts.evaluateUser(USER, NOW)).toBe(1);
    expect(db.alert.rows[0]).toMatchObject({ type: "large_purchase" });
  });

  it("is idempotent across repeated evaluations", async () => {
    await db.connectedAccount.create({
      data: {
        userId: USER,
        institutionName: "Test Bank",
        name: "Everyday Checking",
        type: "checking",
        mask: "4521",
        balanceCents: 1_200,
      },
    });

    expect(await alerts.evaluateUser(USER, NOW)).toBe(1);
    expect(await alerts.evaluateUser(USER, NOW)).toBe(0);
    expect(await alerts.evaluateUser(USER, NOW)).toBe(0);
    expect(db.alert.rows).toHaveLength(1);
  });

  it("does not read another member's accounts", async () => {
    await db.connectedAccount.create({
      data: {
        userId: "22222222-2222-4222-8222-222222222222",
        institutionName: "Test Bank",
        name: "Someone Else Checking",
        type: "checking",
        mask: "0001",
        balanceCents: 100,
      },
    });

    expect(await alerts.evaluateUser(USER, NOW)).toBe(0);
  });
});

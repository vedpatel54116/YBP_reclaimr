import { beforeEach, describe, expect, it } from "vitest";
import { AlertService } from "../../src/modules/alerts/alert.service";
import { BillDetectionService } from "../../src/modules/detection/bill-detection.service";
import { MerchantNormalizationService } from "../../src/modules/detection/merchant-normalization.service";
import { SubscriptionDetectionService } from "../../src/modules/detection/subscription-detection.service";
import { createFakePrisma, type FakePrisma } from "../support/fake-prisma";

/**
 * Detection *reconciliation*. The scoring engine itself is pure and covered
 * in @reclaimr/core; what is tested here is the database-facing half: that
 * re-running detection refreshes rows instead of duplicating them, that
 * bills and subscriptions land in separate tables, and that member edits
 * survive an automated run.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-08-22T12:00:00.000Z");

let db: FakePrisma;
let accountId: string;
let subscriptions: SubscriptionDetectionService;
let bills: BillDetectionService;

beforeEach(async () => {
  db = createFakePrisma();
  const merchants = new MerchantNormalizationService(db.asPrisma());
  subscriptions = new SubscriptionDetectionService(
    db.asPrisma(),
    merchants,
    new AlertService(db.asPrisma()),
  );
  bills = new BillDetectionService(db.asPrisma(), merchants);

  const account = await db.connectedAccount.create({
    data: {
      userId: USER,
      institutionName: "Test Bank",
      name: "Premier Checking",
      type: "checking",
      mask: "4521",
      balanceCents: 250_000,
    },
  });
  accountId = account.id as string;
});

/**
 * Seed a monthly charge series ending `monthsBack` months before NOW.
 * Amounts may vary per charge (bills) or stay flat (subscriptions).
 */
async function seedMonthly(options: {
  merchantName: string;
  amountsCents: number[];
  category?: string;
  dayOfMonth?: number;
  userId?: string;
  endMonthsBack?: number;
}): Promise<void> {
  const {
    merchantName,
    amountsCents,
    category = "other",
    dayOfMonth = 12,
    userId = USER,
    endMonthsBack = 0,
  } = options;

  const count = amountsCents.length;
  for (let i = 0; i < count; i++) {
    // Oldest first; the last entry is `endMonthsBack` months before NOW.
    const monthsAgo = count - 1 - i + endMonthsBack;
    const occurredAt = new Date(
      Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - monthsAgo, dayOfMonth, 12),
    );
    await db.transaction.create({
      data: {
        userId,
        accountId,
        externalId: `${merchantName}-${i}-${userId}`,
        merchantName,
        amountCents: amountsCents[i],
        category,
        occurredAt,
      },
    });
  }
}

describe("SubscriptionDetectionService.runForUser", () => {
  it("creates a subscription for a stable monthly series", async () => {
    await seedMonthly({ merchantName: "NETFLIX.COM 405882 RE", amountsCents: [1799, 1799, 1799] });

    const result = await subscriptions.runForUser(USER, NOW);

    expect(result.created).toBe(1);
    expect(db.subscription.rows).toHaveLength(1);
    expect(db.subscription.rows[0]).toMatchObject({
      userId: USER,
      name: "Netflix",
      amountCents: 1799,
      cadence: "monthly",
      status: "active",
      source: "auto",
    });
    expect(db.subscription.rows[0]?.confidence).toBeGreaterThan(0.9);
    expect(db.subscription.rows[0]?.firstDetectedAt).toEqual(NOW);
  });

  it("ignores a series with too few charges", async () => {
    await seedMonthly({ merchantName: "NETFLIX.COM", amountsCents: [1799, 1799] });

    const result = await subscriptions.runForUser(USER, NOW);

    expect(result.created).toBe(0);
    expect(db.subscription.rows).toHaveLength(0);
  });

  it("re-running refreshes the existing row instead of duplicating it", async () => {
    await seedMonthly({ merchantName: "SPOTIFY USA", amountsCents: [1199, 1199, 1199] });

    const first = await subscriptions.runForUser(USER, NOW);
    const second = await subscriptions.runForUser(USER, NOW);

    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect(db.subscription.rows).toHaveLength(1);
  });

  it("flags the underlying transactions as recurring", async () => {
    await seedMonthly({ merchantName: "SPOTIFY USA", amountsCents: [1199, 1199, 1199] });

    const result = await subscriptions.runForUser(USER, NOW);

    expect(result.flagged).toBe(3);
    expect(db.transaction.rows.every((row) => row.isRecurring === true)).toBe(true);
  });

  it("raises exactly one new_subscription_detected alert per subscription", async () => {
    await seedMonthly({ merchantName: "SPOTIFY USA", amountsCents: [1199, 1199, 1199] });

    await subscriptions.runForUser(USER, NOW);
    await subscriptions.runForUser(USER, NOW);

    const detectedAlerts = db.alert.rows.filter((a) => a.type === "new_subscription_detected");
    expect(detectedAlerts).toHaveLength(1);
  });

  it("records a price increase and alerts once", async () => {
    // Three charges at the old price, then two at the new one.
    await seedMonthly({
      merchantName: "NETFLIX.COM 405882 RE",
      amountsCents: [1549, 1549, 1549, 1799, 1799],
    });

    await subscriptions.runForUser(USER, NOW);

    const subscription = db.subscription.rows[0];
    expect(subscription?.amountCents).toBe(1799);

    const priceAlerts = db.alert.rows.filter((a) => a.type === "price_increase");
    expect(priceAlerts).toHaveLength(1);
    expect((priceAlerts[0]?.data as Record<string, unknown>).previousAmountCents).toBe(1549);

    // A second run must not re-alert.
    await subscriptions.runForUser(USER, NOW);
    expect(db.alert.rows.filter((a) => a.type === "price_increase")).toHaveLength(1);
  });

  /**
   * The common real-world shape: the subscription is already tracked at the
   * old price when the hike lands. The refresh path must notice, stamp
   * priceChangedAt, and alert — reporting the price actually charged before.
   */
  it("alerts when an already-tracked subscription raises its price", async () => {
    await seedMonthly({
      merchantName: "NETFLIX.COM 405882 RE",
      amountsCents: [1549, 1549, 1549],
      endMonthsBack: 1,
    });
    await subscriptions.runForUser(USER, NOW);

    expect(db.subscription.rows[0]).toMatchObject({ amountCents: 1549, priceChangedAt: null });
    expect(db.alert.rows.filter((a) => a.type === "price_increase")).toHaveLength(0);

    // The hike arrives on the next sync.
    await db.transaction.create({
      data: {
        userId: USER,
        accountId,
        externalId: "netflix-hike",
        merchantName: "NETFLIX.COM 405882 RE",
        amountCents: 1799,
        occurredAt: new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 12, 12)),
      },
    });
    const result = await subscriptions.runForUser(USER, NOW);

    expect(result.updated).toBe(1);
    expect(db.subscription.rows).toHaveLength(1);
    expect(db.subscription.rows[0]).toMatchObject({ amountCents: 1799, priceChangedAt: NOW });

    const priceAlerts = db.alert.rows.filter((a) => a.type === "price_increase");
    expect(priceAlerts).toHaveLength(1);
    expect((priceAlerts[0]?.data as Record<string, unknown>).previousAmountCents).toBe(1549);
    expect(priceAlerts[0]?.body).toContain("$15.49");
    expect(priceAlerts[0]?.body).toContain("$17.99");
  });

  it("does not resurrect a member-paused subscription", async () => {
    await seedMonthly({ merchantName: "SPOTIFY USA", amountsCents: [1199, 1199, 1199] });
    await subscriptions.runForUser(USER, NOW);

    await db.subscription.updateMany({ where: { userId: USER }, data: { status: "paused" } });
    await subscriptions.runForUser(USER, NOW);

    expect(db.subscription.rows[0]?.status).toBe("paused");
  });

  it("re-activates a cancel_requested subscription that kept charging", async () => {
    await seedMonthly({ merchantName: "SPOTIFY USA", amountsCents: [1199, 1199, 1199] });
    await subscriptions.runForUser(USER, NOW);

    await db.subscription.updateMany({
      where: { userId: USER },
      data: { status: "cancel_requested" },
    });
    await subscriptions.runForUser(USER, NOW);

    expect(db.subscription.rows[0]?.status).toBe("active");
  });

  it("leaves a manually added subscription untouched", async () => {
    await seedMonthly({ merchantName: "SPOTIFY USA", amountsCents: [1199, 1199, 1199] });
    const merchant = await db.merchant.create({
      data: { normalizedKey: "spotify", canonicalName: "Spotify" },
    });
    await db.subscription.create({
      data: {
        userId: USER,
        merchantId: merchant.id,
        name: "My Spotify",
        amountCents: 999,
        cadence: "monthly",
        nextBillingDate: new Date("2026-09-12T00:00:00.000Z"),
        source: "manual",
      },
    });

    await subscriptions.runForUser(USER, NOW);

    const manual = db.subscription.rows.find((row) => row.source === "manual");
    expect(manual).toMatchObject({ name: "My Spotify", amountCents: 999 });
    // The auto row is created alongside it, never merged into the manual one.
    expect(db.subscription.rows.filter((row) => row.source === "auto")).toHaveLength(1);
  });

  it("does not read or write another member's data", async () => {
    await seedMonthly({
      merchantName: "SPOTIFY USA",
      amountsCents: [1199, 1199, 1199],
      userId: OTHER_USER,
    });

    const result = await subscriptions.runForUser(USER, NOW);

    expect(result.created).toBe(0);
    expect(db.subscription.rows).toHaveLength(0);
  });

  it("excludes pending transactions from detection input", async () => {
    await seedMonthly({ merchantName: "SPOTIFY USA", amountsCents: [1199, 1199, 1199] });
    await db.transaction.updateMany({ where: { userId: USER }, data: { isPending: true } });

    const result = await subscriptions.runForUser(USER, NOW);

    expect(result.created).toBe(0);
  });

  it("ignores charges older than the lookback window", async () => {
    await seedMonthly({
      merchantName: "SPOTIFY USA",
      amountsCents: [1199, 1199, 1199],
      endMonthsBack: 18,
    });

    const result = await subscriptions.runForUser(USER, NOW);

    expect(result.created).toBe(0);
  });
});

describe("BillDetectionService.runForUser", () => {
  it("creates a bill for a recurring utility with variable amounts", async () => {
    await seedMonthly({
      merchantName: "CONSOLIDATED EDISON",
      amountsCents: [11_200, 13_450, 9_870, 12_100],
      category: "utilities",
      dayOfMonth: 8,
    });

    const result = await bills.runForUser(USER, NOW);

    expect(result.created).toBe(1);
    expect(db.bill.rows).toHaveLength(1);
    expect(db.bill.rows[0]).toMatchObject({
      userId: USER,
      category: "utilities",
      cadence: "monthly",
      dueDay: 8,
      isActive: true,
    });
    expect(db.bill.rows[0]?.confidence).toBeGreaterThan(0);
  });

  it("links the bill to the account that paid it", async () => {
    await seedMonthly({
      merchantName: "COMCAST XFINITY INTERNET",
      amountsCents: [8_999, 8_999, 8_999],
      category: "telecommunications",
    });

    await bills.runForUser(USER, NOW);

    expect(db.bill.rows[0]?.connectedAccountId).toBe(accountId);
  });

  it("re-running refreshes rather than duplicating", async () => {
    await seedMonthly({
      merchantName: "VERIZON WIRELESS PYMT",
      amountsCents: [7_500, 7_500, 7_500],
      category: "telecommunications",
    });

    const first = await bills.runForUser(USER, NOW);
    const second = await bills.runForUser(USER, NOW);

    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect(db.bill.rows).toHaveLength(1);
  });

  it("marks a known negotiable provider as negotiable", async () => {
    await seedMonthly({
      merchantName: "COMCAST XFINITY INTERNET",
      amountsCents: [8_999, 8_999, 8_999],
      category: "telecommunications",
    });

    await bills.runForUser(USER, NOW);

    expect(db.bill.rows[0]?.negotiable).toBe(true);
  });

  it("does not read another member's data", async () => {
    await seedMonthly({
      merchantName: "CONSOLIDATED EDISON",
      amountsCents: [11_200, 13_450, 9_870],
      category: "utilities",
      userId: OTHER_USER,
    });

    const result = await bills.runForUser(USER, NOW);

    expect(result.created).toBe(0);
    expect(db.bill.rows).toHaveLength(0);
  });
});

describe("bills and subscriptions stay in separate tables", () => {
  beforeEach(async () => {
    await seedMonthly({
      merchantName: "NETFLIX.COM 405882 RE",
      amountsCents: [1799, 1799, 1799],
      category: "entertainment",
    });
    await seedMonthly({
      merchantName: "CONSOLIDATED EDISON",
      amountsCents: [11_200, 13_450, 9_870],
      category: "utilities",
      dayOfMonth: 8,
    });
  });

  it("routes a streaming charge to subscriptions only", async () => {
    await subscriptions.runForUser(USER, NOW);

    expect(db.subscription.rows.map((row) => row.name)).toEqual(["Netflix"]);
  });

  it("routes a utility charge to bills only", async () => {
    await bills.runForUser(USER, NOW);

    expect(db.bill.rows).toHaveLength(1);
    expect(db.bill.rows[0]?.category).toBe("utilities");
  });

  it("running both engines produces one row in each table", async () => {
    await subscriptions.runForUser(USER, NOW);
    await bills.runForUser(USER, NOW);

    expect(db.subscription.rows).toHaveLength(1);
    expect(db.bill.rows).toHaveLength(1);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { SavingsCalculationService } from "../../src/modules/savings/savings-calculation.service";
import { createFakePrisma, type FakePrisma } from "../support/fake-prisma";

/**
 * Savings calculation. The load-bearing rule (ARCHITECTURE D9) is that the
 * "reclaimed" counter reflects the confirmed ledger only — projections must
 * never leak into it, because ReclaimR bills a success fee against it.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-08-22T12:00:00.000Z");

let db: FakePrisma;
let savings: SavingsCalculationService;

beforeEach(() => {
  db = createFakePrisma();
  savings = new SavingsCalculationService(db.asPrisma());
});

async function savingsEvent(options: {
  amountCents: number;
  kind?: string;
  occurredAt: string;
  userId?: string;
}): Promise<void> {
  await db.savingsEvent.create({
    data: {
      userId: options.userId ?? USER,
      kind: options.kind ?? "subscription_canceled",
      amountCents: options.amountCents,
      description: "Canceled a subscription",
      occurredAt: new Date(`${options.occurredAt}T00:00:00.000Z`),
    },
  });
}

async function subscription(options: {
  name: string;
  amountCents: number;
  cadence?: string;
  status?: string;
}): Promise<void> {
  await db.subscription.create({
    data: {
      userId: USER,
      name: options.name,
      amountCents: options.amountCents,
      cadence: options.cadence ?? "monthly",
      status: options.status ?? "active",
      nextBillingDate: new Date("2026-09-01T00:00:00.000Z"),
    },
  });
}

describe("SavingsCalculationService.summary", () => {
  it("reports zeroes for a member with no ledger entries", async () => {
    const result = await savings.summary(USER, NOW);

    expect(result).toMatchObject({
      totalReclaimedCents: 0,
      thisMonthCents: 0,
      eventCount: 0,
    });
    expect(result.byKind).toEqual([]);
  });

  it("totals the confirmed ledger", async () => {
    await savingsEvent({ amountCents: 1_799, occurredAt: "2026-08-10" });
    await savingsEvent({ amountCents: 2_400, occurredAt: "2026-07-05" });

    const result = await savings.summary(USER, NOW);

    expect(result.totalReclaimedCents).toBe(4_199);
    expect(result.eventCount).toBe(2);
  });

  it("counts only the current calendar month in thisMonthCents", async () => {
    await savingsEvent({ amountCents: 1_000, occurredAt: "2026-08-01" });
    await savingsEvent({ amountCents: 500, occurredAt: "2026-08-22" });
    await savingsEvent({ amountCents: 9_999, occurredAt: "2026-07-31" });

    const result = await savings.summary(USER, NOW);

    expect(result.thisMonthCents).toBe(1_500);
    expect(result.totalReclaimedCents).toBe(11_499);
  });

  it("breaks the total down by kind", async () => {
    await savingsEvent({
      amountCents: 1_799,
      kind: "subscription_canceled",
      occurredAt: "2026-08-10",
    });
    await savingsEvent({
      amountCents: 1_200,
      kind: "subscription_canceled",
      occurredAt: "2026-08-11",
    });
    await savingsEvent({ amountCents: 3_500, kind: "bill_negotiated", occurredAt: "2026-08-12" });

    const result = await savings.summary(USER, NOW);

    const byKind = Object.fromEntries(result.byKind.map((row) => [row.kind, row.amountCents]));
    expect(byKind).toEqual({ subscription_canceled: 2_999, bill_negotiated: 3_500 });
    expect(result.totalReclaimedCents).toBe(6_499);
  });

  it("never counts another member's savings", async () => {
    await savingsEvent({ amountCents: 50_000, occurredAt: "2026-08-10", userId: OTHER_USER });

    const result = await savings.summary(USER, NOW);

    expect(result.totalReclaimedCents).toBe(0);
    expect(result.eventCount).toBe(0);
  });
});

describe("SavingsCalculationService.subscriptionSpend", () => {
  it("returns zero for a member with no subscriptions", async () => {
    const result = await savings.subscriptionSpend(USER);

    expect(result.monthlyTotalCents).toBe(0);
  });

  it("sums monthly-equivalent spend across cadences", async () => {
    await subscription({ name: "Netflix", amountCents: 1_799, cadence: "monthly" });
    await subscription({ name: "NYT", amountCents: 6_000, cadence: "quarterly" });
    await subscription({ name: "Amazon Prime", amountCents: 13_900, cadence: "annual" });

    const result = await savings.subscriptionSpend(USER);

    // Monthly equivalents: 1799 + ~2000 + ~1158.
    expect(result.monthlyTotalCents).toBeGreaterThan(4_700);
    expect(result.monthlyTotalCents).toBeLessThan(5_100);
  });

  it("excludes canceled and paused subscriptions", async () => {
    await subscription({ name: "Netflix", amountCents: 1_799 });
    await subscription({ name: "Hulu", amountCents: 1_299, status: "canceled" });
    await subscription({ name: "Disney+", amountCents: 1_099, status: "paused" });

    const result = await savings.subscriptionSpend(USER);

    expect(result.monthlyTotalCents).toBe(1_799);
  });
});

describe("SavingsCalculationService.billNegotiationPotential", () => {
  async function bill(options: {
    negotiable: boolean;
    lastAmountCents?: number | null;
    expectedAmountCents?: number | null;
    isActive?: boolean;
    cadence?: string;
  }): Promise<void> {
    await db.bill.create({
      data: {
        userId: USER,
        name: "Internet",
        category: "telecommunications",
        dueDay: 8,
        cadence: options.cadence ?? "monthly",
        negotiable: options.negotiable,
        isActive: options.isActive ?? true,
        lastAmountCents: options.lastAmountCents ?? null,
        expectedAmountCents: options.expectedAmountCents ?? null,
      },
    });
  }

  it("returns zero when nothing is negotiable", async () => {
    await bill({ negotiable: false, lastAmountCents: 8_999 });

    const result = await savings.billNegotiationPotential(USER);

    expect(result.monthlyNegotiableCents).toBe(0);
    expect(result.estimatedAnnualSavingsCents).toBe(0);
  });

  it("sums negotiable bills and projects annual savings", async () => {
    await bill({ negotiable: true, lastAmountCents: 8_999 });
    await bill({ negotiable: true, lastAmountCents: 7_500 });

    const result = await savings.billNegotiationPotential(USER);

    expect(result.monthlyNegotiableCents).toBe(16_499);
    // Default rate is a projection, not a promise — it must not be counted
    // as reclaimed anywhere.
    expect(result.estimatedAnnualSavingsCents).toBeGreaterThan(0);
  });

  it("prefers the last charged amount over the expected amount", async () => {
    await bill({ negotiable: true, lastAmountCents: 9_500, expectedAmountCents: 8_000 });

    const result = await savings.billNegotiationPotential(USER);

    expect(result.monthlyNegotiableCents).toBe(9_500);
  });

  it("falls back to the expected amount when nothing has been charged yet", async () => {
    await bill({ negotiable: true, lastAmountCents: null, expectedAmountCents: 8_000 });

    const result = await savings.billNegotiationPotential(USER);

    expect(result.monthlyNegotiableCents).toBe(8_000);
  });

  it("excludes inactive bills", async () => {
    await bill({ negotiable: true, lastAmountCents: 8_999, isActive: false });

    const result = await savings.billNegotiationPotential(USER);

    expect(result.monthlyNegotiableCents).toBe(0);
  });

  it("scales a non-monthly cadence to a monthly equivalent", async () => {
    await bill({ negotiable: true, lastAmountCents: 30_000, cadence: "quarterly" });

    const result = await savings.billNegotiationPotential(USER);

    expect(result.monthlyNegotiableCents).toBe(10_000);
  });

  it("honours an explicit savings rate", async () => {
    await bill({ negotiable: true, lastAmountCents: 10_000 });

    const conservative = await savings.billNegotiationPotential(USER, 0.1);
    const aggressive = await savings.billNegotiationPotential(USER, 0.3);

    expect(aggressive.estimatedAnnualSavingsCents).toBeGreaterThan(
      conservative.estimatedAnnualSavingsCents,
    );
  });
});

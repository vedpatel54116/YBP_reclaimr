import { describe, expect, it } from "vitest";
import { detectSubscriptions } from "../src/detection/detect-subscriptions";
import type { MerchantHintTable } from "../src/types";
import { addDays, day, monthlySeries, NOW, resetFixtureIds, txn } from "./fixtures";

function run(txns: ReturnType<typeof txn>[], hints: MerchantHintTable = new Map()) {
  return detectSubscriptions(txns, { now: NOW, merchantHints: hints });
}

describe("detectSubscriptions", () => {
  it("detects a clean monthly series with high confidence", () => {
    resetFixtureIds();
    const series = monthlySeries(10, {
      endMonth: "2026-08",
      day: 3,
      merchantName: "NETFLIX.COM 405882 RE",
      amountCents: 1549,
    });
    const found = run(series);
    expect(found).toHaveLength(1);
    const sub = found[0]!;
    expect(sub.merchantKey).toBe("netflix");
    expect(sub.displayName).toBe("Netflix"); // via catalog
    expect(sub.cadence).toBe("monthly");
    expect(sub.amountCents).toBe(1549);
    expect(sub.occurrenceCount).toBe(10);
    expect(sub.isActive).toBe(true);
    expect(sub.confidence).toBeGreaterThanOrEqual(0.9);
    // Median calendar gap here is 31 days, so the monthly equivalent is
    // 1549 × 30.4375 / 31 ≈ 1521 — exactly the normalization we want.
    expect(sub.monthlyEquivalentCents).toBe(1521);
    // Next charge ≈ one median gap after the last charge (2026-08-03).
    expect(sub.nextChargeAt.toISOString().slice(0, 10)).toBe("2026-09-03");
    expect(sub.transactionIds).toHaveLength(10);
  });

  it("requires the minimum occurrence count", () => {
    resetFixtureIds();
    const twoCharges = monthlySeries(2, {
      endMonth: "2026-08",
      day: 3,
      merchantName: "SPOTIFY USA",
      amountCents: 1199,
    });
    expect(run(twoCharges)).toHaveLength(0);
  });

  it("flags a price increase when the latest charge jumps >8%", () => {
    resetFixtureIds();
    const series = monthlySeries(10, {
      endMonth: "2026-08",
      day: 3,
      merchantName: "NETFLIX.COM",
      amountCents: (index) => (index >= 7 ? 1799 : 1549), // hike for the last 3
    });
    const sub = run(series)[0]!;
    expect(sub.priceChanged).toBe(true);
    // Prior level = the price actually charged before the hike, not the mean
    // across levels (which would report 1605 — a price never charged).
    expect(sub.previousAmountCents).toBe(1549);
    expect(sub.amountCents).toBe(1799);
  });

  it("reports the prior level even after several charges at the new price", () => {
    resetFixtureIds();
    // Five at the old price, five at the new one: the mean of priors sits
    // between the two levels, so only the mode names a real price.
    const series = monthlySeries(10, {
      endMonth: "2026-08",
      day: 3,
      merchantName: "NETFLIX.COM",
      amountCents: (index) => (index >= 5 ? 1799 : 1499),
    });
    const sub = run(series)[0]!;
    expect(sub.priceChanged).toBe(true);
    expect(sub.previousAmountCents).toBe(1499);
    expect(sub.amountCents).toBe(1799);
  });

  it("does not flag normal small amount drift as a price change", () => {
    resetFixtureIds();
    const series = monthlySeries(8, {
      endMonth: "2026-08",
      day: 3,
      merchantName: "AUDIBLE",
      amountCents: (index) => (index % 2 === 0 ? 1495 : 1505),
    });
    const sub = run(series)[0]!;
    expect(sub.priceChanged).toBe(false);
    expect(sub.previousAmountCents).toBeNull();
  });

  it("excludes bill categories (utilities are bills, not subscriptions)", () => {
    resetFixtureIds();
    const electric = monthlySeries(10, {
      endMonth: "2026-08",
      day: 15,
      merchantName: "CONSOLIDATED EDISON",
      amountCents: 9240,
      category: "utilities",
    });
    expect(run(electric)).toHaveLength(0);
  });

  it("excludes income, transfers, and savings flows even when recurring", () => {
    resetFixtureIds();
    const flows = [
      ...monthlySeries(10, {
        endMonth: "2026-08",
        day: 15,
        merchantName: "PAYROLL DEPT",
        amountCents: -260000,
        category: "income",
      }),
      ...monthlySeries(10, {
        endMonth: "2026-08",
        day: 1,
        merchantName: "ONLINE TRANSFER TO SAVINGS",
        amountCents: 50000,
        category: "transfers",
      }),
    ];
    expect(run(flows)).toHaveLength(0);
  });

  it("includes a curated provider even when its category is generic", () => {
    resetFixtureIds();
    const series = monthlySeries(6, {
      endMonth: "2026-08",
      day: 9,
      merchantName: "SPOTIFY USA",
      amountCents: 1199,
      category: "other",
    });
    const hints: MerchantHintTable = new Map([
      ["spotify", { isSubscriptionProvider: true, displayName: "Spotify" }],
    ]);
    const sub = run(series, hints)[0]!;
    expect(sub.displayName).toBe("Spotify");
  });

  it("marks a series inactive when charges stopped a cadence-plus ago", () => {
    resetFixtureIds();
    // Last charge 4 months ago; a monthly series is stale after ~1.5 months.
    const stale = monthlySeries(6, {
      endMonth: "2026-04",
      day: 3,
      merchantName: "DOLLARSHAVECLUB.COM",
      amountCents: 999,
    });
    const sub = run(stale)[0]!;
    expect(sub.isActive).toBe(false);
  });

  it("ignores refund rows (negative amounts)", () => {
    resetFixtureIds();
    const refunds = monthlySeries(6, {
      endMonth: "2026-08",
      day: 3,
      merchantName: "SOME SERVICE",
      amountCents: -1500,
    });
    expect(run(refunds)).toHaveLength(0);
  });

  it("detects a quarterly series with correct monthly equivalent", () => {
    resetFixtureIds();
    const series = monthlySeries(4, {
      endMonth: "2026-08",
      day: 4,
      merchantName: "NEW YORK TIMES DIGITAL",
      amountCents: 2500,
      monthsStep: 3,
    });
    const sub = run(series)[0]!;
    expect(sub.cadence).toBe("quarterly");
    // Calendar-quarter gaps here are [92, 89, 92] → median 92:
    // 2500 × 30.4375 / 92 ≈ 827.
    expect(sub.monthlyEquivalentCents).toBe(827);
  });

  it("keeps irregular one-off noise out", () => {
    resetFixtureIds();
    const noise = [
      txn({ merchantName: "AMAZON MKTP*US2V3", occurredAt: day("2026-08-01"), amountCents: 3599 }),
      txn({ merchantName: "AMAZON MKTP*US2V3", occurredAt: day("2026-07-19"), amountCents: 1299 }),
      txn({ merchantName: "AMAZON MKTP*US2V3", occurredAt: day("2026-06-02"), amountCents: 8999 }),
      txn({ merchantName: "AMAZON MKTP*US2V3", occurredAt: day("2026-02-11"), amountCents: 2200 }),
    ];
    expect(run(noise)).toHaveLength(0);
  });

  it("is deterministic: same input produces identical output", () => {
    resetFixtureIds();
    const series = [
      ...monthlySeries(8, {
        endMonth: "2026-08",
        day: 1,
        merchantName: "NETFLIX.COM",
        amountCents: 1549,
      }),
      ...monthlySeries(6, {
        endMonth: "2026-08",
        day: 17,
        merchantName: "PLANET FITNESS #0242",
        amountCents: 2499,
        category: "fitness",
      }),
    ];
    const first = JSON.stringify(run(series));
    const second = JSON.stringify(run(series));
    expect(first).toBe(second);
  });

  it("predicts nextChargeAt after a very recent charge", () => {
    resetFixtureIds();
    const last = addDays(NOW, -2);
    const series = [
      txn({ merchantName: "NETFLIX.COM", occurredAt: addDays(last, -93), amountCents: 1549 }),
      txn({ merchantName: "NETFLIX.COM", occurredAt: addDays(last, -62), amountCents: 1549 }),
      txn({ merchantName: "NETFLIX.COM", occurredAt: addDays(last, -31), amountCents: 1549 }),
      txn({ merchantName: "NETFLIX.COM", occurredAt: last, amountCents: 1549 }),
    ];
    const sub = run(series)[0]!;
    expect(sub.lastChargeAt.getTime()).toBe(last.getTime());
    expect(sub.isActive).toBe(true);
    expect(sub.nextChargeAt.getTime()).toBeGreaterThan(last.getTime());
  });
});

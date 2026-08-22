import { describe, expect, it } from "vitest";
import { detectBills } from "../src/detection/detect-bills";
import { day, monthlySeries, NOW, resetFixtureIds, txn } from "./fixtures";

function run(txns: ReturnType<typeof txn>[]) {
  return detectBills(txns, { now: NOW });
}

describe("detectBills", () => {
  it("detects a stable monthly telecom bill as negotiable", () => {
    resetFixtureIds();
    const series = monthlySeries(10, {
      endMonth: "2026-08",
      day: 6,
      merchantName: "COMCAST *XFINITY INTERNET",
      amountCents: 8999,
      category: "telecommunications",
    });
    const bills = run(series);
    expect(bills).toHaveLength(1);
    const bill = bills[0]!;
    expect(bill.displayName).toBe("Xfinity Internet");
    expect(bill.category).toBe("telecommunications");
    expect(bill.dueDay).toBe(6);
    expect(bill.negotiable).toBe(true);
    expect(bill.expectedAmountCents).toBe(8999);
    expect(bill.isActive).toBe(true);
    expect(bill.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("tolerates variable utility amounts (seasonal electric bill)", () => {
    resetFixtureIds();
    const series = monthlySeries(10, {
      endMonth: "2026-08",
      day: 15,
      merchantName: "CONSOLIDATED EDISON",
      amountCents: (index) => 6000 + index * 800, // 60 → 132 dollars
      category: "utilities",
    });
    const bill = run(series)[0]!;
    expect(bill).toBeDefined();
    // Median of the ramp ≈ 9600; the last amount is the latest observation.
    expect(bill.expectedAmountCents).toBeGreaterThan(0);
    expect(bill.lastAmountCents).toBe(6000 + 9 * 800);
    expect(bill.negotiable).toBe(false); // utilities are not negotiated by default
  });

  it("derives dueDay from the modal charge day", () => {
    resetFixtureIds();
    const series = monthlySeries(9, {
      endMonth: "2026-08",
      day: 11,
      merchantName: "VERIZON WIRELESS PYMT",
      amountCents: 8250,
      category: "telecommunications",
    });
    const bill = run(series)[0]!;
    expect(bill.dueDay).toBe(11);
  });

  it("detects quarterly insurance premiums", () => {
    resetFixtureIds();
    const series = monthlySeries(4, {
      endMonth: "2026-08",
      day: 8,
      merchantName: "GEICO AUTO 1234",
      amountCents: 41250,
      category: "insurance",
      monthsStep: 3,
    });
    const bill = run(series)[0]!;
    expect(bill.cadence).toBe("quarterly");
    expect(bill.negotiable).toBe(true);
  });

  it("ignores subscriptions (non-bill categories)", () => {
    resetFixtureIds();
    const series = monthlySeries(10, {
      endMonth: "2026-08",
      day: 3,
      merchantName: "NETFLIX.COM",
      amountCents: 1549,
      category: "entertainment",
    });
    expect(run(series)).toHaveLength(0);
  });

  it("requires the minimum occurrence count", () => {
    resetFixtureIds();
    const series = monthlySeries(2, {
      endMonth: "2026-08",
      day: 1,
      merchantName: "SUNRISE PROPERTY MGMT RENT",
      amountCents: 215000,
      category: "housing",
    });
    expect(run(series)).toHaveLength(0);
  });

  it("marks a bill inactive when payments stopped", () => {
    resetFixtureIds();
    const stale = monthlySeries(8, {
      endMonth: "2026-03", // 5 months quiet
      day: 1,
      merchantName: "SUNRISE PROPERTY MGMT RENT",
      amountCents: 215000,
      category: "housing",
    });
    const bill = run(stale)[0]!;
    expect(bill.isActive).toBe(false);
  });

  it("keeps bills and subscriptions separated from a mixed history", () => {
    resetFixtureIds();
    const mixed = [
      ...monthlySeries(10, {
        endMonth: "2026-08",
        day: 3,
        merchantName: "NETFLIX.COM",
        amountCents: 1549,
        category: "entertainment",
      }),
      ...monthlySeries(10, {
        endMonth: "2026-08",
        day: 15,
        merchantName: "CONSOLIDATED EDISON",
        amountCents: 9240,
        category: "utilities",
      }),
      ...monthlySeries(10, {
        endMonth: "2026-08",
        day: 6,
        merchantName: "COMCAST *XFINITY INTERNET",
        amountCents: 8999,
        category: "telecommunications",
      }),
      txn({
        merchantName: "CHIPOTLE 2231",
        occurredAt: day("2026-08-20"),
        amountCents: 1425,
        category: "dining",
      }),
    ];
    const bills = run(mixed);
    expect(bills.map((b) => b.merchantKey).sort()).toEqual([
      "comcast xfinity internet",
      "consolidated edison",
    ]);
  });
});

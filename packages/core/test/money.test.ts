import { describe, expect, it } from "vitest";
import { monthlyEquivalentCents } from "../src/money/monthly-equivalent";
import { estimatedNegotiationSavingsCents, subscriptionSpend } from "../src/money/savings";
import { median, mode, stdev } from "../src/stats";

describe("monthlyEquivalentCents", () => {
  it("monthly passes through", () => {
    expect(monthlyEquivalentCents(1549, "monthly")).toBe(1549);
  });

  it("annual divides by twelve (half-up)", () => {
    expect(monthlyEquivalentCents(13900, "annual")).toBe(1158); // 1158.33
  });

  it("weekly multiplies to ~4.35×", () => {
    expect(monthlyEquivalentCents(1000, "weekly")).toBe(4348); // 4348.21
  });

  it("biweekly multiplies to ~2.17×", () => {
    expect(monthlyEquivalentCents(1000, "biweekly")).toBe(2174);
  });

  it("quarterly divides by three (half-up)", () => {
    expect(monthlyEquivalentCents(2500, "quarterly")).toBe(833); // 833.33
  });
});

describe("subscriptionSpend", () => {
  it("totals monthly and annual equivalents across subscriptions", () => {
    const spend = subscriptionSpend([
      { subscriptionId: "a", name: "Netflix", amountCents: 1549, cadence: "monthly" },
      { subscriptionId: "b", name: "NYT", amountCents: 2500, cadence: "quarterly" },
      { subscriptionId: "c", name: "Prime", amountCents: 13900, cadence: "annual" },
    ]);
    expect(spend.monthlyTotalCents).toBe(1549 + 833 + 1158);
    expect(spend.annualTotalCents).toBe(spend.monthlyTotalCents * 12);
    expect(spend.lines).toHaveLength(3);
  });

  it("handles an empty portfolio", () => {
    const spend = subscriptionSpend([]);
    expect(spend.monthlyTotalCents).toBe(0);
    expect(spend.lines).toHaveLength(0);
  });
});

describe("estimatedNegotiationSavingsCents", () => {
  it("projects 15% of first-year bill spend by default", () => {
    // 17,250 cents/month → 207,000/year → 15% = 31,050
    expect(estimatedNegotiationSavingsCents(17_250)).toBe(31_050);
  });

  it("supports an explicit rate", () => {
    expect(estimatedNegotiationSavingsCents(10_000, 0.35)).toBe(42_000);
  });
});

describe("stats", () => {
  it("median handles odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it("stdev of identical values is zero", () => {
    expect(stdev([5, 5, 5])).toBe(0);
  });

  it("mode breaks ties toward the smaller value", () => {
    expect(mode([7, 3, 3, 7])).toBe(3);
  });
});

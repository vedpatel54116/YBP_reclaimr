import { describe, expect, it } from "vitest";
import {
  cancellationSavingsCents,
  isValidFeePercent,
  settleNegotiation,
} from "../src/money/case-money";

describe("isValidFeePercent", () => {
  it("accepts whole percentages in (0, 100]", () => {
    for (const value of [1, 35, 50, 60, 100]) {
      expect(isValidFeePercent(value)).toBe(true);
    }
  });

  it("rejects zero, negatives, over-100, and fractions", () => {
    for (const value of [0, -1, 101, 35.5, Number.NaN, Infinity]) {
      expect(isValidFeePercent(value)).toBe(false);
    }
  });
});

describe("settleNegotiation", () => {
  it("splits savings into our fee and the member's share", () => {
    const settlement = settleNegotiation(24_000, 40);
    expect(settlement).toEqual({
      confirmedAnnualSavingsCents: 24_000,
      feeAmountCents: 9_600,
      netAnnualSavingsCents: 14_400,
    });
  });

  it("always sums back to the confirmed savings", () => {
    for (const savings of [1, 99, 100, 1_234, 24_000, 987_654]) {
      for (const percent of [35, 40, 47, 55, 60]) {
        const settlement = settleNegotiation(savings, percent);
        expect(settlement.feeAmountCents + settlement.netAnnualSavingsCents).toBe(savings);
      }
    }
  });

  it("returns integer cents, never fractions", () => {
    const settlement = settleNegotiation(1_001, 37);
    expect(Number.isInteger(settlement.feeAmountCents)).toBe(true);
    expect(Number.isInteger(settlement.netAnnualSavingsCents)).toBe(true);
  });

  it("rounds the fee half-up", () => {
    // 1% of 50 cents is 0.5, which rounds up to 1.
    expect(settleNegotiation(50, 1).feeAmountCents).toBe(1);
  });

  it("never charges more than the saving it is charged against", () => {
    for (const savings of [0, 1, 2, 3]) {
      for (const percent of [35, 60, 100]) {
        const settlement = settleNegotiation(savings, percent);
        expect(settlement.feeAmountCents).toBeLessThanOrEqual(savings);
        expect(settlement.netAnnualSavingsCents).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("charges nothing when there were no savings", () => {
    expect(settleNegotiation(0, 60)).toEqual({
      confirmedAnnualSavingsCents: 0,
      feeAmountCents: 0,
      netAnnualSavingsCents: 0,
    });
  });

  it("takes the whole cent when a 100% fee meets a one-cent saving", () => {
    // The clamp is what keeps net at 0 rather than negative.
    expect(settleNegotiation(1, 100)).toEqual({
      confirmedAnnualSavingsCents: 1,
      feeAmountCents: 1,
      netAnnualSavingsCents: 0,
    });
  });

  it("rejects a non-integer or negative savings amount", () => {
    expect(() => settleNegotiation(-1, 40)).toThrow(/non-negative integer/);
    expect(() => settleNegotiation(10.5, 40)).toThrow(/non-negative integer/);
  });

  it("rejects a fee percent that is not a whole percentage", () => {
    expect(() => settleNegotiation(1_000, 0)).toThrow(/whole percentage/);
    expect(() => settleNegotiation(1_000, 101)).toThrow(/whole percentage/);
  });
});

describe("cancellationSavingsCents", () => {
  it("annualizes a monthly amount", () => {
    expect(cancellationSavingsCents(1_599)).toBe(1_599 * 12);
  });

  it("defaults to treating the amount as already monthly", () => {
    expect(cancellationSavingsCents(1_000)).toBe(cancellationSavingsCents(1_000, "monthly"));
  });

  it("normalizes other cadences to a monthly equivalent before annualizing", () => {
    // An annual $45 plan is ~$3.75/mo, so a year of it is ~$45 again.
    const annual = cancellationSavingsCents(4_500, "annual");
    expect(annual).toBeGreaterThan(4_400);
    expect(annual).toBeLessThan(4_600);
  });

  it("values a weekly subscription far above a monthly one of the same charge", () => {
    expect(cancellationSavingsCents(1_000, "weekly")).toBeGreaterThan(
      cancellationSavingsCents(1_000, "monthly"),
    );
  });

  it("returns zero for a zero-cost subscription", () => {
    expect(cancellationSavingsCents(0)).toBe(0);
  });
});

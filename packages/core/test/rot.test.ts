import { describe, expect, it } from "vitest";
import {
  computeRotScore,
  DEFAULT_BENCHMARK_HOURS,
  DEFAULT_SHAPE_EXPONENT,
  getRotTier,
  summarizeRotPortfolio,
} from "../src/rot";

describe("Rot Score Calculation", () => {
  it("returns 100% rot and full price as waste when usage is 0", () => {
    const result = computeRotScore({
      hoursUsedMonth: 0,
      monthlyPriceCents: 1599,
      benchmarkHoursMonth: 20,
    });

    expect(result.rotScore).toBe(100);
    expect(result.rotRatio).toBe(1);
    expect(result.utilizationRatio).toBe(0);
    expect(result.wastedMonthlyCents).toBe(1599);
    expect(result.capturedValueMonthlyCents).toBe(0);
    expect(result.costPerHourUsedCents).toBeNull();
    expect(result.tier).toBe("high_rot");
    expect(result.tierLabel).toBe("High Rot");
  });

  it("returns 0% rot and 0 wasted cents when usage meets or exceeds benchmark cap", () => {
    const atCap = computeRotScore({
      hoursUsedMonth: 20,
      monthlyPriceCents: 2000,
      benchmarkHoursMonth: 20,
    });

    expect(atCap.rotScore).toBe(0);
    expect(atCap.rotRatio).toBe(0);
    expect(atCap.utilizationRatio).toBe(1);
    expect(atCap.wastedMonthlyCents).toBe(0);
    expect(atCap.capturedValueMonthlyCents).toBe(2000);
    expect(atCap.costPerHourUsedCents).toBe(100);
    expect(atCap.tier).toBe("healthy");
    expect(atCap.tierLabel).toBe("Healthy");

    const overCap = computeRotScore({
      hoursUsedMonth: 35,
      monthlyPriceCents: 2000,
      benchmarkHoursMonth: 20,
    });

    expect(overCap.rotScore).toBe(0);
    expect(overCap.rotRatio).toBe(0);
    expect(overCap.utilizationRatio).toBe(1);
    expect(overCap.wastedMonthlyCents).toBe(0);
    expect(overCap.tier).toBe("healthy");
  });

  it("exhibits non-linear diminishing returns curve with a=0.5", () => {
    // With P=5000, S_cap=20, a=0.5
    // S=2 hrs: u=0.1, sqrt(0.1)=0.3162, rotRatio=0.6838 -> ~68% rot
    const lowUse = computeRotScore({
      hoursUsedMonth: 2,
      monthlyPriceCents: 5000,
      benchmarkHoursMonth: 20,
      shapeExponent: 0.5,
    });

    expect(lowUse.rotScore).toBe(68);
    expect(lowUse.tier).toBe("high_rot");
    expect(lowUse.wastedMonthlyCents).toBe(3419);
    expect(lowUse.capturedValueMonthlyCents).toBe(1581);

    // S=10 hrs: u=0.5, sqrt(0.5)=0.7071, rotRatio=0.2929 -> ~29% rot
    const midUse = computeRotScore({
      hoursUsedMonth: 10,
      monthlyPriceCents: 5000,
      benchmarkHoursMonth: 20,
      shapeExponent: 0.5,
    });

    expect(midUse.rotScore).toBe(29);
    expect(midUse.tier).toBe("healthy");
    expect(midUse.wastedMonthlyCents).toBe(1464);
  });

  it("handles default benchmark hours (20) and exponent (0.5) when omitted", () => {
    const result = computeRotScore({
      hoursUsedMonth: 5,
      monthlyPriceCents: 1600,
    });

    expect(result.benchmarkHoursMonth).toBe(DEFAULT_BENCHMARK_HOURS);
    expect(result.shapeExponent).toBe(DEFAULT_SHAPE_EXPONENT);
    // u = 5/20 = 0.25, sqrt(0.25) = 0.5, rotRatio = 0.5 -> 50% rot
    expect(result.rotScore).toBe(50);
    expect(result.wastedMonthlyCents).toBe(800);
    expect(result.capturedValueMonthlyCents).toBe(800);
    expect(result.tier).toBe("moderate_rot");
  });

  it("handles negative and NaN edge cases safely", () => {
    const negative = computeRotScore({
      hoursUsedMonth: -5,
      monthlyPriceCents: -100,
    });

    expect(negative.hoursUsedMonth).toBe(0);
    expect(negative.monthlyPriceCents).toBe(0);
    expect(negative.rotScore).toBe(100);
    expect(negative.wastedMonthlyCents).toBe(0);
  });

  it("classifies rot tiers correctly according to thresholds", () => {
    expect(getRotTier(100).tier).toBe("high_rot");
    expect(getRotTier(60).tier).toBe("high_rot");
    expect(getRotTier(59).tier).toBe("moderate_rot");
    expect(getRotTier(30).tier).toBe("moderate_rot");
    expect(getRotTier(29).tier).toBe("healthy");
    expect(getRotTier(0).tier).toBe("healthy");
  });

  it("summarizes rot metrics across a portfolio of subscriptions", () => {
    const items = [
      { hoursUsedMonth: 0, monthlyPriceCents: 2000, benchmarkHoursMonth: 20 }, // 100% rot, $20 waste
      { hoursUsedMonth: 5, monthlyPriceCents: 1600, benchmarkHoursMonth: 20 }, // 50% rot, $8 waste
      { hoursUsedMonth: 20, monthlyPriceCents: 1000, benchmarkHoursMonth: 20 }, // 0% rot, $0 waste
    ];

    const summary = summarizeRotPortfolio(items);

    expect(summary.totalMonthlyCents).toBe(4600);
    expect(summary.totalWastedMonthlyCents).toBe(2800);
    expect(summary.totalCapturedValueMonthlyCents).toBe(1800);
    expect(summary.highRotCount).toBe(1);
    expect(summary.moderateRotCount).toBe(1);
    expect(summary.healthyCount).toBe(1);
    // Weighted avg score: (100*2000 + 50*1600 + 0*1000) / 4600 = 280000 / 4600 = 60.87 -> 61
    expect(summary.averageRotScore).toBe(61);
  });

  it("handles empty portfolio gracefully", () => {
    const summary = summarizeRotPortfolio([]);
    expect(summary.totalMonthlyCents).toBe(0);
    expect(summary.totalWastedMonthlyCents).toBe(0);
    expect(summary.averageRotScore).toBe(0);
    expect(summary.highRotCount).toBe(0);
  });
});

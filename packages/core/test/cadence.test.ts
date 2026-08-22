import { describe, expect, it } from "vitest";
import { computeGapStats, matchCadenceBand, predictNextCharge } from "../src/detection/cadence";
import { day } from "./fixtures";

describe("computeGapStats", () => {
  it("returns null for fewer than two dates", () => {
    expect(computeGapStats([day("2026-01-01")])).toBeNull();
    expect(computeGapStats([])).toBeNull();
  });

  it("measures monthly gaps regardless of month length", () => {
    const dates = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"].map(day);
    const stats = computeGapStats(dates)!;
    // Gaps are [31, 28, 31] → median 31; the monthly band tolerates this.
    expect(stats.medianGapDays).toBeCloseTo(31, 0);
    expect(stats.gapStdevDays).toBeLessThan(1.6);
  });
});

describe("matchCadenceBand", () => {
  it("classifies a weekly series", () => {
    const band = matchCadenceBand({ medianGapDays: 7, gapStdevDays: 0.5 });
    expect(band?.cadence).toBe("weekly");
  });

  it("classifies a monthly series with 31/28-day jitter", () => {
    const band = matchCadenceBand({ medianGapDays: 30.75, gapStdevDays: 1.5 });
    expect(band?.cadence).toBe("monthly");
  });

  it("classifies quarterly and annual series", () => {
    expect(matchCadenceBand({ medianGapDays: 91, gapStdevDays: 2 })?.cadence).toBe("quarterly");
    expect(matchCadenceBand({ medianGapDays: 365, gapStdevDays: 3 })?.cadence).toBe("annual");
  });

  it("rejects irregular gaps", () => {
    expect(matchCadenceBand({ medianGapDays: 23, gapStdevDays: 1 })).toBeNull();
  });

  it("rejects regular gaps with high jitter", () => {
    expect(matchCadenceBand({ medianGapDays: 30, gapStdevDays: 12 })).toBeNull();
  });
});

describe("predictNextCharge", () => {
  it("adds the median gap (rounded) to the last charge", () => {
    const last = day("2026-07-05");
    const next = predictNextCharge(last, 30.4375);
    expect(next.toISOString().slice(0, 10)).toBe("2026-08-04");
  });
});

import { describe, expect, it } from "vitest";
import { addUtcDays, billOccurrences, clampedDueDate, startOfUtcDay } from "../src/bills/schedule";

const iso = (date: Date): string => date.toISOString().slice(0, 10);
const day = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

describe("clampedDueDate", () => {
  it("keeps a day that exists in the month", () => {
    expect(iso(clampedDueDate(2026, 0, 15))).toBe("2026-01-15");
  });

  it("clips day 31 to the end of a 30-day month", () => {
    expect(iso(clampedDueDate(2026, 3, 31))).toBe("2026-04-30");
  });

  it("clips day 31 to the end of February in a non-leap year", () => {
    expect(iso(clampedDueDate(2026, 1, 31))).toBe("2026-02-28");
  });

  it("clips to the 29th in a leap February", () => {
    expect(iso(clampedDueDate(2028, 1, 31))).toBe("2028-02-29");
  });
});

describe("startOfUtcDay / addUtcDays", () => {
  it("strips the time component", () => {
    expect(startOfUtcDay(new Date("2026-05-04T17:45:12.345Z")).toISOString()).toBe(
      "2026-05-04T00:00:00.000Z",
    );
  });

  it("moves forwards and backwards by whole days", () => {
    expect(iso(addUtcDays(day("2026-03-01"), -1))).toBe("2026-02-28");
    expect(iso(addUtcDays(day("2026-02-28"), 1))).toBe("2026-03-01");
  });
});

describe("billOccurrences — monthly", () => {
  it("returns one date per month inside the window", () => {
    const dates = billOccurrences("monthly", 15, day("2026-01-01"), day("2026-03-31"));
    expect(dates.map(iso)).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
  });

  it("includes a due date on the window's first day", () => {
    const dates = billOccurrences("monthly", 1, day("2026-01-01"), day("2026-01-31"));
    expect(dates.map(iso)).toEqual(["2026-01-01"]);
  });

  it("includes a due date on the window's last day", () => {
    const dates = billOccurrences("monthly", 31, day("2026-01-01"), day("2026-01-31"));
    expect(dates.map(iso)).toEqual(["2026-01-31"]);
  });

  it("clips a day-31 bill across a short month rather than spilling into the next", () => {
    const dates = billOccurrences("monthly", 31, day("2026-02-01"), day("2026-04-30"));
    expect(dates.map(iso)).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("returns nothing when the window contains no due date", () => {
    const dates = billOccurrences("monthly", 20, day("2026-01-01"), day("2026-01-10"));
    expect(dates).toEqual([]);
  });

  it("looks slightly backwards so a recently-passed due date is still found", () => {
    // Window opens mid-month; the 5th has already passed but is inside it.
    const dates = billOccurrences("monthly", 5, day("2026-06-03"), day("2026-06-20"));
    expect(dates.map(iso)).toEqual(["2026-06-05"]);
  });

  it("crosses a year boundary", () => {
    const dates = billOccurrences("monthly", 10, day("2026-11-01"), day("2027-02-28"));
    expect(dates.map(iso)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10", "2027-02-10"]);
  });
});

describe("billOccurrences — quarterly and annual", () => {
  it("steps a quarterly bill three months at a time", () => {
    const dates = billOccurrences("quarterly", 1, day("2026-01-01"), day("2026-12-31"));
    expect(dates.map(iso)).toEqual(["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01"]);
  });

  it("yields a single annual occurrence per year", () => {
    const dates = billOccurrences("annual", 20, day("2026-01-01"), day("2027-12-31"));
    expect(dates.map(iso)).toEqual(["2026-01-20", "2027-01-20"]);
  });

  it("finds an annual due date near the start of the window", () => {
    const dates = billOccurrences("annual", 3, day("2026-03-01"), day("2026-03-31"));
    expect(dates.map(iso)).toEqual(["2026-03-03"]);
  });
});

describe("billOccurrences — weekly and biweekly", () => {
  it("steps a weekly bill every seven days", () => {
    const dates = billOccurrences("weekly", 1, day("2026-01-01"), day("2026-01-29"));
    expect(dates.map(iso)).toEqual([
      "2026-01-01",
      "2026-01-08",
      "2026-01-15",
      "2026-01-22",
      "2026-01-29",
    ]);
  });

  it("steps a biweekly bill every fourteen days", () => {
    const dates = billOccurrences("biweekly", 1, day("2026-01-01"), day("2026-02-12"));
    expect(dates.map(iso)).toEqual(["2026-01-01", "2026-01-15", "2026-01-29", "2026-02-12"]);
  });

  it("aligns to the cycle when the window opens after the anchor", () => {
    const dates = billOccurrences("weekly", 1, day("2026-01-10"), day("2026-01-23"));
    expect(dates.map(iso)).toEqual(["2026-01-15", "2026-01-22"]);
  });
});

describe("billOccurrences — window handling", () => {
  it("returns nothing for an inverted window", () => {
    expect(billOccurrences("monthly", 15, day("2026-03-01"), day("2026-01-01"))).toEqual([]);
  });

  it("returns ascending dates", () => {
    const dates = billOccurrences("monthly", 15, day("2026-01-01"), day("2026-06-30"));
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    expect(dates).toEqual(sorted);
  });

  it("stays bounded over a very long window", () => {
    const dates = billOccurrences("weekly", 1, day("2020-01-01"), day("2040-01-01"));
    expect(dates.length).toBeLessThanOrEqual(400);
  });

  it("returns UTC-midnight dates", () => {
    for (const date of billOccurrences("monthly", 9, day("2026-01-01"), day("2026-03-31"))) {
      expect(date.toISOString().endsWith("T00:00:00.000Z")).toBe(true);
    }
  });
});

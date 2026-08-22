import type { DetectionTransaction, TransactionCategory } from "../src/types";

/** Fixture clock: fixed "now" so every test is deterministic. */
export const NOW = new Date("2026-08-22T12:00:00.000Z");

let counter = 0;

export function resetFixtureIds(): void {
  counter = 0;
}

export interface TxnInput {
  merchantName: string;
  category?: TransactionCategory;
  occurredAt: Date;
  amountCents: number;
}

export function txn(input: TxnInput): DetectionTransaction {
  counter += 1;
  return {
    id: `txn-${counter}`,
    merchantName: input.merchantName,
    category: input.category ?? "other",
    occurredAt: input.occurredAt,
    amountCents: input.amountCents,
  };
}

/** "2026-08-01" → UTC-noon Date (noon avoids TZ edge flakiness in day math). */
export function day(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Build a recurring monthly series on a given day-of-month. */
export function monthlySeries(
  count: number,
  opts: {
    endMonth: string; // "2026-08" — the most recent charge's month
    day: number;
    merchantName: string;
    amountCents: number | ((index: number) => number);
    category?: TransactionCategory;
    monthsStep?: number; // 1 = monthly, 3 = quarterly
  },
): DetectionTransaction[] {
  const step = opts.monthsStep ?? 1;
  const [year, month] = opts.endMonth.split("-").map(Number) as [number, number];
  const result: DetectionTransaction[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(Date.UTC(year, month - 1 - i * step, Math.min(opts.day, 28)));
    const amount =
      typeof opts.amountCents === "function" ? opts.amountCents(count - 1 - i) : opts.amountCents;
    result.push(
      txn({
        merchantName: opts.merchantName,
        category: opts.category,
        occurredAt: date,
        amountCents: amount,
      }),
    );
  }
  return result;
}

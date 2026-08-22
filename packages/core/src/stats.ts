/** Small statistics helpers shared by the detection engine. All pure. */

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("median of empty list");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const right = sorted[mid];
  if (right === undefined) throw new Error("median index out of range");
  if (sorted.length % 2 === 1) return right;
  const left = sorted[mid - 1] ?? 0;
  return (left + right) / 2;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error("mean of empty list");
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Population standard deviation. Single-element lists are perfectly stable. */
export function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length);
}

/** Most frequent value; ties broken toward the smaller value (deterministic). */
export function mode(values: readonly number[]): number {
  if (values.length === 0) throw new Error("mode of empty list");
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: { value: number; count: number } | null = null;
  for (const [value, count] of counts) {
    if (!best || count > best.count || (count === best.count && value < best.value)) {
      best = { value, count };
    }
  }
  if (!best) throw new Error("mode produced no result");
  return best.value;
}

/** Half-up rounding for money math (avoids banker's-rounding surprises). */
export function roundMoneyCents(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export const MS_PER_DAY = 86_400_000;

export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MS_PER_DAY;
}

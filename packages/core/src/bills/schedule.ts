import type { BillingCadence } from "../types";

/**
 * Bill due-date projection.
 *
 * Bills are stored as "day N of the period", not as a list of dates, so the
 * calendar has to be reconstructed on read. Two details matter and are easy to
 * get wrong: a `dueDay` of 31 must land on the 28th in February rather than
 * spilling into March, and the projection must be able to look slightly
 * backwards so a bill that came due a few days ago can be shown as overdue.
 *
 * Pure and injected-time like the rest of @reclaimr/core.
 */

/** Cadences that advance by whole months and keep their day-of-month. */
const MONTH_STEP: Partial<Record<BillingCadence, number>> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

/** Cadences that advance by a fixed number of days. */
const DAY_STEP: Partial<Record<BillingCadence, number>> = {
  weekly: 7,
  biweekly: 14,
};

/** Guard against a pathological window producing an unbounded list. */
const MAX_OCCURRENCES = 400;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** UTC midnight on `day` of the given month, clipped to the month's length. */
export function clampedDueDate(year: number, month: number, dueDay: number): Date {
  // Day 0 of the following month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(dueDay, daysInMonth)));
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/**
 * Every due date for a bill within the inclusive window `[from, to]`, ascending.
 * Returns an empty list when the window is inverted.
 */
export function billOccurrences(
  cadence: BillingCadence,
  dueDay: number,
  from: Date,
  to: Date,
): Date[] {
  if (from.getTime() > to.getTime()) return [];

  const monthStep = MONTH_STEP[cadence];
  return monthStep === undefined
    ? dayCadenceOccurrences(DAY_STEP[cadence] ?? 7, dueDay, from, to)
    : monthCadenceOccurrences(monthStep, dueDay, from, to);
}

function monthCadenceOccurrences(monthStep: number, dueDay: number, from: Date, to: Date): Date[] {
  const results: Date[] = [];
  // Begin one step before the window so a quarterly or annual bill whose due
  // date sits just inside `from` is not skipped by starting too late.
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth() - monthStep;

  for (let i = 0; i < MAX_OCCURRENCES; i += 1) {
    const occurrence = clampedDueDate(year, month, dueDay);
    if (occurrence.getTime() > to.getTime()) break;
    if (occurrence.getTime() >= from.getTime()) results.push(occurrence);
    month += monthStep;
    // Normalizing keeps `month` in range so clampedDueDate reads the right
    // month length.
    year += Math.floor(month / 12);
    month = ((month % 12) + 12) % 12;
  }
  return results;
}

function dayCadenceOccurrences(dayStep: number, dueDay: number, from: Date, to: Date): Date[] {
  // Weekly and biweekly bills have no meaningful day-of-month, so `dueDay`
  // only anchors the cycle: take it in the window's opening month and step.
  let cursor = clampedDueDate(from.getUTCFullYear(), from.getUTCMonth(), dueDay);

  // Walk to the first occurrence at or after `from`, in either direction.
  const stepMs = dayStep * MS_PER_DAY;
  const drift = Math.ceil((from.getTime() - cursor.getTime()) / stepMs);
  cursor = new Date(cursor.getTime() + drift * stepMs);

  const results: Date[] = [];
  for (let i = 0; i < MAX_OCCURRENCES && cursor.getTime() <= to.getTime(); i += 1) {
    if (cursor.getTime() >= from.getTime()) results.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + stepMs);
  }
  return results;
}

import { MS_PER_DAY } from "../stats";
import type { AlertDraft } from "../types";

/**
 * Pure alert rules: one predicate family per AlertType. Each returns drafts
 * with a stable dedupKey; the persistence layer suppresses duplicates by that
 * key, so rules can fire on every evaluation without spamming members.
 */

export const LOW_BALANCE_THRESHOLD_CENTS = 5_000; // $50
export const LARGE_PURCHASE_THRESHOLD_CENTS = 25_000; // $250
export const UPCOMING_BILL_WINDOW_DAYS = 3;

export type CashAccountType =
  "checking" | "savings" | "credit_card" | "loan" | "mortgage" | "investment" | "other";

export interface BalanceAccountView {
  accountId: string;
  name: string;
  type: CashAccountType;
  balanceCents: number | null;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Low balance on cash accounts (checking/savings). */
export function findLowBalanceAccounts(
  accounts: readonly BalanceAccountView[],
  thresholdCents: number = LOW_BALANCE_THRESHOLD_CENTS,
): AlertDraft[] {
  const drafts: AlertDraft[] = [];
  for (const account of accounts) {
    if (account.type !== "checking" && account.type !== "savings") continue;
    if (account.balanceCents === null) continue;
    if (account.balanceCents >= thresholdCents) continue;
    drafts.push({
      type: "low_balance",
      severity: "warning",
      title: "Low balance",
      body: `${account.name} dropped to ${formatCents(account.balanceCents)}.`,
      dedupKey: `low_balance:${account.accountId}:${account.balanceCents}`,
      data: { accountId: account.accountId, balanceCents: account.balanceCents, thresholdCents },
    });
  }
  return drafts;
}

export interface PurchaseView {
  transactionId: string;
  merchantName: string;
  amountCents: number;
}

/** Notable outgoing transactions over a threshold. */
export function findLargePurchases(
  purchases: readonly PurchaseView[],
  thresholdCents: number = LARGE_PURCHASE_THRESHOLD_CENTS,
): AlertDraft[] {
  const drafts: AlertDraft[] = [];
  for (const purchase of purchases) {
    if (purchase.amountCents <= thresholdCents) continue;
    drafts.push({
      type: "large_purchase",
      severity: "warning",
      title: "Large purchase",
      body: `${purchase.merchantName} charged ${formatCents(purchase.amountCents)}.`,
      dedupKey: `large_purchase:${purchase.transactionId}`,
      data: { transactionId: purchase.transactionId, amountCents: purchase.amountCents },
    });
  }
  return drafts;
}

export interface BillScheduleView {
  billId: string;
  name: string;
  dueDay: number;
  expectedAmountCents: number | null;
  lastAmountCents: number | null;
}

/** Days in the month `monthOffset` after `now` (0 = current month). */
function daysInMonthOf(now: Date, monthOffset: number): number {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset + 1, 0),
  ).getUTCDate();
}

/** The next occurrence of `dueDay` on or after today, clipped to month length. */
export function nextDueDate(dueDay: number, now: Date): Date {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let offset = 0; offset <= 1; offset++) {
    const length = daysInMonthOf(now, offset);
    const day = Math.min(dueDay, length);
    const candidate = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, day);
    if (candidate >= today) return new Date(candidate);
  }
  // dueDay can be at most 31 and both months were in the past — impossible,
  // but keep a safe fallback rather than returning an invalid date.
  return new Date(today + MS_PER_DAY);
}

export interface UpcomingBillMatch {
  draft: AlertDraft;
  billId: string;
  dueDate: Date;
}

/** Bills due within `withinDays`, including overdue ones (due date passed). */
export function findUpcomingBills(
  bills: readonly BillScheduleView[],
  now: Date,
  withinDays: number = UPCOMING_BILL_WINDOW_DAYS,
): UpcomingBillMatch[] {
  const matches: UpcomingBillMatch[] = [];
  for (const bill of bills) {
    const due = nextDueDate(bill.dueDay, now);
    const daysUntilDue = (due.getTime() - now.getTime()) / MS_PER_DAY;
    if (daysUntilDue > withinDays) continue;
    const amount = bill.expectedAmountCents ?? bill.lastAmountCents;
    matches.push({
      billId: bill.billId,
      dueDate: due,
      draft: {
        type: "upcoming_bill",
        severity: "info",
        title: "Upcoming bill",
        body:
          amount !== null
            ? `${bill.name} is due ${due.toISOString().slice(0, 10)} for about ${formatCents(amount)}.`
            : `${bill.name} is due ${due.toISOString().slice(0, 10)}.`,
        dedupKey: `upcoming_bill:${bill.billId}:${due.toISOString().slice(0, 10)}`,
        data: {
          billId: bill.billId,
          dueDate: due.toISOString().slice(0, 10),
          amountCents: amount,
        },
      },
    });
  }
  return matches;
}

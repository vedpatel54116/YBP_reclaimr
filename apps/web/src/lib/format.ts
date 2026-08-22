import type { BillingCadence } from "@reclaimr/shared";

/** Formats integer cents as a currency string, e.g. 1499 -> "$14.99". */
export function formatMoney(amountCents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100);
}

/** Compact money for large aggregates, e.g. 243800 -> "$2,438". */
export function formatMoneyRounded(amountCents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

const CADENCE_LABEL: Record<BillingCadence, string> = {
  weekly: "per week",
  biweekly: "every 2 weeks",
  monthly: "per month",
  quarterly: "per quarter",
  annual: "per year",
};

export function formatCadence(cadence: BillingCadence): string {
  return CADENCE_LABEL[cadence];
}

/** Formats an ISO date (date-only or datetime) as "Aug 22, 2026". */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/** Short date without the year, for dense tables: "Aug 22". */
export function formatDateShort(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/** Relative time for alerts and activity, e.g. "3h ago" / "2d ago". */
export function formatRelativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

/** Whole days from today (UTC) until an ISO date; negative means past. */
export function daysUntil(iso: string, now = new Date()): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = new Date(iso);
  const targetDay = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.round((targetDay - today) / 86_400_000);
}

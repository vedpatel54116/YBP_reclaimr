/**
 * Shared primitives used across every ReclaimR domain model.
 *
 * Conventions:
 * - Timestamps are ISO-8601 strings with timezone (e.g. `2026-08-22T14:30:00.000Z`).
 * - Dates that carry no time of day (transaction posting dates, due dates, charge
 *   dates) are calendar dates (e.g. `2026-08-22`).
 * - All monetary amounts are integer cents in USD to avoid floating-point drift.
 * - Absent data is `null`, never `undefined`; `undefined` is reserved for
 *   "field not present in this payload shape".
 */

/** ISO-8601 timestamp with timezone, e.g. `2026-08-22T14:30:00.000Z`. */
export type ISODateString = string;

/** Calendar date without a time component, e.g. `2026-08-22`. */
export type CalendarDateString = string;

/**
 * Entity ids are opaque prefixed strings (`usr_1`, `txn_42`, ...). These aliases
 * are structural (they collapse to `string`) but document intent at call sites.
 */
export type UserId = string;
export type SessionId = string;
export type ConnectedAccountId = string;
export type FinancialInstitutionId = string;
export type TransactionId = string;
export type MerchantId = string;
export type SubscriptionId = string;
export type BillId = string;
export type CaseId = string;
export type CaseNoteId = string;
export type TimelineEventId = string;
export type NegotiationOfferId = string;
export type DocumentUploadId = string;
export type SavingsEventId = string;
export type AlertId = string;
export type NotificationId = string;
export type PremiumSubscriptionId = string;
export type ConsentRecordId = string;
export type AuditLogId = string;
export type AdminUserId = string;

/** ReclaimR is USD-only in v1. */
export type Currency = 'USD';

/**
 * A JSON-safe value. Used for audit trails, where arbitrary field values are
 * recorded before/after a change.
 */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

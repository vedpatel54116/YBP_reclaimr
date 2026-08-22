/**
 * Financial data: institutions, linked accounts, transactions, and the
 * canonical merchant table that powers detection.
 */
import type {
  CalendarDateString,
  ConnectedAccountId,
  Currency,
  FinancialInstitutionId,
  ISODateString,
  MerchantId,
  SubscriptionId,
  BillId,
  TransactionId,
  UserId,
} from './common.js';
import { AccountSyncStatus, AccountType, TransactionType } from './enums.js';

/** An institution available through the aggregation provider (10k+). */
export interface FinancialInstitution {
  id: FinancialInstitutionId;
  /** Institution id in the provider's namespace (e.g. Plaid `institution_id`). */
  providerId: string;
  name: string;
  /** Email domains used to suggest institutions during the link flow. */
  domains: string[];
  /** ISO country code; v1 is US-only. */
  country: string;
  /** False once the provider delists it; existing links keep their history. */
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** A bank/card account linked by the user via the read-only aggregator. */
export interface ConnectedAccount {
  id: ConnectedAccountId;
  userId: UserId;
  institutionId: FinancialInstitutionId;
  /** Aggregator item id; null for manually tracked accounts. */
  providerItemId: string | null;
  /** Display name, e.g. `Chase Checking`. */
  name: string;
  type: AccountType;
  /** Last four digits of the account number — display only. */
  mask: string;
  /**
   * Signed balance in cents. Positive = funds the user owns (checking,
   * savings, investment); negative = amount owed (credit card, loan, mortgage).
   */
  balanceCents: number;
  /** Available to spend (checking/credit); null when not reported. */
  availableBalanceCents: number | null;
  currency: Currency;
  /** Bank links are read-only by charter; money movement is separately consented. */
  accessMode: 'read-only';
  syncStatus: AccountSyncStatus;
  lastSyncedAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  /** Set when the user unlinks the account; transactions are retained. */
  unlinkedAt: ISODateString | null;
}

/** A single bank transaction, as normalized after an aggregation sync. */
export interface Transaction {
  id: TransactionId;
  userId: UserId;
  accountId: ConnectedAccountId;
  /** Populated once the raw description matches a canonical merchant. */
  merchantId: MerchantId | null;
  /** Posting date — banks do not provide reliable intraday timestamps. */
  date: CalendarDateString;
  /** Description exactly as the bank reported it. */
  rawDescription: string;
  type: TransactionType;
  /**
   * Signed amount in cents: positive = money leaving the account (charge,
   * fee), negative = money coming in (refund, deposit, interest).
   */
  amountCents: number;
  /** Spend category — default taxonomy or user-created. */
  category: string;
  /** True once the detection engine matched this charge to a recurring series. */
  isRecurring: boolean;
  /** Recurring series this charge belongs to, when matched. */
  subscriptionId: SubscriptionId | null;
  billId: BillId | null;
  note: string | null;
  /** True while the bank still reports the transaction as pending. */
  isPending: boolean;
  /** Aggregator transaction id, used to deduplicate on sync. */
  providerTransactionId: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * A canonical merchant after normalization. The detection engine maps noisy
 * raw descriptions (store numbers, card prefixes, noise tokens) onto these.
 */
export interface Merchant {
  id: MerchantId;
  /** Canonical display name, e.g. `Netflix`. */
  canonicalName: string;
  /** Raw-description variants that normalize to this merchant. */
  aliases: string[];
  /** Default spend category for this merchant's charges. */
  category: string;
  /** True when this merchant commonly bills on a recurring cadence. */
  isSubscriptionProvider: boolean;
  /** True for providers the concierge negotiates (internet, phone, insurance, TV). */
  isNegotiable: boolean;
  /** Self-serve cancellation resources surfaced to free users. */
  cancellationUrl: string | null;
  cancellationPhone: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

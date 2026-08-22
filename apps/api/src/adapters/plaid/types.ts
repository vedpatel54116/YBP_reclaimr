/**
 * The PlaidAdapter port. Everything the product needs from Plaid, expressed
 * as plain data so services never touch vendor SDK shapes. Two
 * implementations exist: PlaidHttpAdapter (real API) and MockPlaidAdapter
 * (deterministic, for dev and tests).
 */

import type { AccountType } from "@reclaimr/shared";

export interface PlaidLinkToken {
  linkToken: string;
  expiration: string; // ISO
}

export interface PlaidExchangeResult {
  accessToken: string;
  itemId: string;
}

export interface PlaidAccountView {
  externalAccountId: string;
  name: string;
  type: AccountType;
  mask: string;
  /** Signed cents; negative = owed on credit products. */
  balanceCents: number | null;
  availableCents: number | null;
  currency: string;
}

export interface PlaidAccountsResult {
  institutionId: string | null;
  institutionName: string | null;
  accounts: PlaidAccountView[];
}

export interface PlaidTransactionView {
  externalId: string;
  externalAccountId: string;
  /** Posting date + fixed noon UTC time (banks give dates, not instants). */
  occurredAt: Date;
  merchantName: string;
  /** Positive = money out; negative = money in (Plaid convention). */
  amountCents: number;
  isPending: boolean;
  /** Aggregator's category guess (Plaid personal_finance_category); the
   *  curated merchant table wins when it disagrees on a known merchant. */
  categoryHint: string | null;
}

export interface PlaidSyncPage {
  added: PlaidTransactionView[];
  modified: PlaidTransactionView[];
  /** External ids removed by the institution (voided / deduplicated). */
  removed: string[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type PlaidErrorKind = "reauth" | "invalid" | "network" | "unknown";

export class PlaidAdapterError extends Error {
  constructor(
    readonly kind: PlaidErrorKind,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PlaidAdapterError";
  }
}

export interface PlaidAdapter {
  /** Mint a short-lived Link token for the browser SDK. */
  createLinkToken(input: { userId: string }): Promise<PlaidLinkToken>;

  /** Exchange the single-use public token for a long-lived access token. */
  exchangePublicToken(publicToken: string): Promise<PlaidExchangeResult>;

  /** Accounts + balances for an item. */
  getAccounts(accessToken: string): Promise<PlaidAccountsResult>;

  /**
   * One page of the incremental transaction sync. Callers loop until
   * hasMore is false, persisting nextCursor between runs.
   */
  syncTransactions(accessToken: string, cursor: string | null): Promise<PlaidSyncPage>;
}

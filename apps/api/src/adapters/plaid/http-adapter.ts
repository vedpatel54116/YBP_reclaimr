import { APP_NAME, type AccountType } from "@reclaimr/shared";
import {
  PlaidAdapterError,
  type PlaidAdapter,
  type PlaidAccountsResult,
  type PlaidAccountView,
  type PlaidExchangeResult,
  type PlaidLinkToken,
  type PlaidSyncPage,
  type PlaidTransactionView,
} from "./types";

/**
 * Real Plaid adapter over the REST API (native fetch — the official SDK is
 * not needed for four endpoints and skipping it keeps the dependency tree
 * small and the behavior fully observable in tests).
 */

const PLAID_HOSTS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
} as const;

interface PlaidApiErrorBody {
  error_code?: string;
  error_message?: string;
  error_type?: string;
}

// Codes meaning "the member must re-authenticate this item".
const REAUTH_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "ITEM_LOCKED",
  "ITEM_NO_VERIFICATION",
  "ITEM_NOT_FOUND",
  "ITEM_NOT_ACCESSIBLE",
]);

function dollarsToCents(amount: number): number {
  return Math.round(amount * 100);
}

type PlaidAccountType = string;

function mapAccountType(type: PlaidAccountType, subtype: string | null | undefined): AccountType {
  switch (type) {
    case "depository":
      return subtype === "savings" ? "savings" : "checking";
    case "credit":
      return "credit_card";
    case "loan":
      return subtype === "mortgage" ? "mortgage" : "loan";
    case "brokerage":
    case "investment":
      return "investment";
    default:
      return "other";
  }
}

export interface HttpAdapterConfig {
  clientId: string;
  secret: string;
  env: "sandbox" | "development" | "production";
}

export class PlaidHttpAdapter implements PlaidAdapter {
  private readonly baseUrl: string;
  /**
   * institution_id → display name. Institution names never change within a
   * process lifetime, and /accounts/get is called on every sync, so caching
   * spares one extra Plaid round trip per sync.
   */
  private readonly institutionNames = new Map<string, string | null>();

  constructor(private readonly config: HttpAdapterConfig) {
    this.baseUrl = PLAID_HOSTS[config.env];
  }

  private async call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_id: this.config.clientId,
          secret: this.config.secret,
          ...body,
        }),
      });
    } catch (error) {
      throw new PlaidAdapterError(
        "network",
        `Plaid request failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as T & PlaidApiErrorBody;

    if (!response.ok) {
      const code = payload.error_code ?? "UNKNOWN";
      const message = payload.error_message ?? `Plaid ${path} returned ${response.status}`;
      const kind = REAUTH_CODES.has(code)
        ? "reauth"
        : code === "INVALID_INPUT" || code === "INVALID_API_KEYS"
          ? "invalid"
          : "unknown";
      throw new PlaidAdapterError(kind, message, code);
    }
    return payload;
  }

  async createLinkToken(input: { userId: string }): Promise<PlaidLinkToken> {
    const result = await this.call<{ link_token: string; expiration: string }>(
      "/link/token/create",
      {
        client_name: APP_NAME,
        // Read-only by construction: only the Transactions product is requested.
        products: ["transactions"],
        country_codes: ["US"],
        language: "en",
        user: { client_user_id: input.userId },
      },
    );
    return { linkToken: result.link_token, expiration: result.expiration };
  }

  async exchangePublicToken(publicToken: string): Promise<PlaidExchangeResult> {
    const result = await this.call<{ access_token: string; item_id: string }>(
      "/item/public_token/exchange",
      { public_token: publicToken },
    );
    return { accessToken: result.access_token, itemId: result.item_id };
  }

  async getAccounts(accessToken: string): Promise<PlaidAccountsResult> {
    const result = await this.call<{
      accounts: Array<{
        account_id: string;
        name: string | null;
        official_name: string | null;
        type: PlaidAccountType;
        subtype: string | null;
        mask: string | null;
        balances: {
          current: number | null;
          available: number | null;
          iso_currency_code: string | null;
        };
      }>;
      item: { institution_id: string | null };
    }>("/accounts/get", { access_token: accessToken, options: {} });

    const institutionId = result.item?.institution_id ?? null;

    const accounts: PlaidAccountView[] = result.accounts.map((account) => {
      const type = mapAccountType(account.type, account.subtype);
      // Plaid reports credit balances as positive-owed; our sign convention
      // is negative = owed.
      const current =
        account.balances.current === null
          ? null
          : type === "credit_card" || type === "loan" || type === "mortgage"
            ? -dollarsToCents(account.balances.current)
            : dollarsToCents(account.balances.current);
      return {
        externalAccountId: account.account_id,
        name: account.name ?? account.official_name ?? "Unnamed account",
        type,
        mask: account.mask ?? "0000",
        balanceCents: current,
        availableCents:
          account.balances.available === null ? null : dollarsToCents(account.balances.available),
        currency: account.balances.iso_currency_code ?? "USD",
      };
    });

    return {
      institutionId,
      institutionName:
        institutionId === null ? null : await this.resolveInstitutionName(institutionId),
      accounts,
    };
  }

  /**
   * Look up an institution's display name. Best-effort: a failure here must
   * not fail the sync that triggered it, because the name is presentation
   * only — callers fall back to a generic label. Negative results are cached
   * too, so a persistently failing lookup is not retried on every sync.
   */
  private async resolveInstitutionName(institutionId: string): Promise<string | null> {
    const cached = this.institutionNames.get(institutionId);
    if (cached !== undefined) return cached;

    let name: string | null = null;
    try {
      const result = await this.call<{ institution: { name: string | null } }>(
        "/institutions/get_by_id",
        { institution_id: institutionId, country_codes: ["US"] },
      );
      name = result.institution?.name ?? null;
    } catch {
      name = null;
    }
    this.institutionNames.set(institutionId, name);
    return name;
  }

  async syncTransactions(accessToken: string, cursor: string | null): Promise<PlaidSyncPage> {
    const result = await this.call<{
      added: PlaidTxnDto[];
      modified: PlaidTxnDto[];
      removed: Array<{ transaction_id: string }>;
      next_cursor: string | null;
      has_more: boolean;
    }>("/transactions/sync", {
      access_token: accessToken,
      cursor: cursor ?? undefined,
      count: 200,
    });

    const map = (dto: PlaidTxnDto): PlaidTransactionView => ({
      externalId: dto.transaction_id,
      externalAccountId: dto.account_id,
      occurredAt: new Date(`${dto.date}T12:00:00.000Z`),
      merchantName: dto.merchant_name ?? dto.name,
      amountCents: dollarsToCents(dto.amount),
      isPending: dto.pending ?? false,
      // The curated merchant table classifies; Plaid's personal_finance_category
      // mapping is a future refinement.
      categoryHint: null,
    });

    return {
      added: result.added.map(map),
      modified: result.modified.map(map),
      removed: result.removed.map((r) => r.transaction_id),
      nextCursor: result.next_cursor,
      hasMore: result.has_more,
    };
  }
}

interface PlaidTxnDto {
  transaction_id: string;
  account_id: string;
  date: string; // YYYY-MM-DD
  name: string;
  merchant_name: string | null;
  amount: number;
  pending: boolean | null;
}

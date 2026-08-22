import type {
  PlaidAccountsResult,
  PlaidAdapter,
  PlaidExchangeResult,
  PlaidLinkToken,
  PlaidSyncPage,
} from "../../src/adapters/plaid";

/**
 * Scriptable Plaid adapter for service tests.
 *
 * MockPlaidAdapter (in src/) generates a realistic 10-month history and is
 * the right tool for end-to-end detection fixtures. This one is the opposite:
 * it returns exactly the pages you queue, counts calls, and can be told to
 * throw — which is what reliability tests need (cursor handoff, partial
 * failure mid-pagination, re-auth handling).
 */
export class ScriptedPlaidAdapter implements PlaidAdapter {
  /** Cursors passed to syncTransactions, in call order. */
  readonly cursorsSeen: Array<string | null> = [];
  getAccountsCalls = 0;

  private readonly pages: PlaidSyncPage[] = [];
  private accountsResult: PlaidAccountsResult = {
    institutionId: "ins_test",
    institutionName: "Test Bank",
    accounts: [],
  };
  private syncError: Error | null = null;
  private accountsError: Error | null = null;
  /** Fail the Nth (0-based) syncTransactions call, after earlier ones apply. */
  private failOnPage: number | null = null;

  /** Queue a page. Pages are served in order, one per syncTransactions call. */
  queuePage(page: Partial<PlaidSyncPage> & { nextCursor: string | null }): this {
    this.pages.push({
      added: page.added ?? [],
      modified: page.modified ?? [],
      removed: page.removed ?? [],
      nextCursor: page.nextCursor,
      hasMore: page.hasMore ?? false,
    });
    return this;
  }

  setAccounts(result: PlaidAccountsResult): this {
    this.accountsResult = result;
    return this;
  }

  failSyncWith(error: Error): this {
    this.syncError = error;
    return this;
  }

  failGetAccountsWith(error: Error): this {
    this.accountsError = error;
    return this;
  }

  failOnSyncCall(index: number, error: Error): this {
    this.failOnPage = index;
    this.syncError = error;
    return this;
  }

  async createLinkToken(input: { userId: string }): Promise<PlaidLinkToken> {
    return {
      linkToken: `link-sandbox-${input.userId}`,
      expiration: new Date("2026-08-22T16:00:00.000Z").toISOString(),
    };
  }

  async exchangePublicToken(publicToken: string): Promise<PlaidExchangeResult> {
    return { accessToken: `access-${publicToken}`, itemId: `item-${publicToken}` };
  }

  async getAccounts(): Promise<PlaidAccountsResult> {
    this.getAccountsCalls += 1;
    if (this.accountsError) throw this.accountsError;
    return this.accountsResult;
  }

  async syncTransactions(_accessToken: string, cursor: string | null): Promise<PlaidSyncPage> {
    const callIndex = this.cursorsSeen.length;
    this.cursorsSeen.push(cursor);

    if (this.syncError && (this.failOnPage === null || this.failOnPage === callIndex)) {
      throw this.syncError;
    }
    const page = this.pages[callIndex];
    if (!page) return { added: [], modified: [], removed: [], nextCursor: cursor, hasMore: false };
    return page;
  }
}

import type { TransactionCategory } from "@reclaimr/shared";
import type {
  PlaidAdapter,
  PlaidAccountsResult,
  PlaidExchangeResult,
  PlaidLinkToken,
  PlaidSyncPage,
  PlaidTransactionView,
} from "./types";

/**
 * Deterministic mock aggregator. Same access token + same injected clock →
 * byte-identical accounts and transactions, so the whole pipeline (sync →
 * merchant normalization → detection) is testable in CI with no network, no
 * keys, and no flakiness. The generated history contains the patterns the
 * product exists to find:
 *
 *   - 8 subscriptions with regular cadences (one with a recent price hike)
 *   - 5 bills (fixed, variable, and quarterly) in bill categories
 *   - a once-a-year charge that must NOT be detected (too few occurrences)
 *   - biweekly income and monthly noise
 */

const PAGE_SIZE = 100;
const MONTHS_OF_HISTORY = 10;

// ── Deterministic primitives ────────────────────────────────────────────────

function hash32(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: tiny, fast, deterministic PRNG. */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

// ── Catalog ─────────────────────────────────────────────────────────────────

interface RecurringSeries {
  description: string;
  category: TransactionCategory;
  dayOfMonth: number;
  /** 1 = monthly, 3 = quarterly, 12 = annual. */
  monthsStep: number;
  /** Phase within the step (which month of the cycle charges land on). */
  phase: number;
  /** Amounts in cents, oldest first; last value repeats. */
  amounts: number[];
  accountId: "checking" | "credit";
}

const SERIES: RecurringSeries[] = [
  // Subscriptions (discretionary recurring)
  {
    description: "NETFLIX.COM 405882 RE",
    category: "entertainment",
    dayOfMonth: 3,
    monthsStep: 1,
    phase: 0,
    amounts: [1549, 1549, 1549, 1549, 1549, 1549, 1549, 1799, 1799, 1799, 1799],
    accountId: "credit",
  },
  {
    description: "SPOTIFY USA",
    category: "entertainment",
    dayOfMonth: 9,
    monthsStep: 1,
    phase: 0,
    amounts: [1199],
    accountId: "credit",
  },
  {
    description: "APPLE BILL ICLOUD",
    category: "subscriptions",
    dayOfMonth: 23,
    monthsStep: 1,
    phase: 0,
    amounts: [299],
    accountId: "credit",
  },
  {
    description: "ADOBE CREATIVE CLOUD",
    category: "subscriptions",
    dayOfMonth: 5,
    monthsStep: 1,
    phase: 0,
    amounts: [6588],
    accountId: "credit",
  },
  {
    description: "PLANET FITNESS #0242",
    category: "fitness",
    dayOfMonth: 17,
    monthsStep: 1,
    phase: 0,
    amounts: [2499],
    accountId: "checking",
  },
  {
    description: "SIRIUSXM RADIO INC",
    category: "entertainment",
    dayOfMonth: 12,
    monthsStep: 1,
    phase: 0,
    amounts: [2199],
    accountId: "checking",
  },
  {
    description: "DOLLARSHAVECLUB.COM",
    category: "shopping",
    dayOfMonth: 2,
    monthsStep: 1,
    phase: 0,
    amounts: [999],
    accountId: "credit",
  },
  {
    description: "NEW YORK TIMES DIGITAL",
    category: "subscriptions",
    dayOfMonth: 4,
    monthsStep: 3,
    phase: 0,
    amounts: [2500],
    accountId: "checking",
  },

  // Bills (fixed life admin)
  {
    description: "COMCAST *XFINITY INTERNET",
    category: "telecommunications",
    dayOfMonth: 6,
    monthsStep: 1,
    phase: 0,
    amounts: [8999],
    accountId: "checking",
  },
  {
    description: "VERIZON WIRELESS PYMT",
    category: "telecommunications",
    dayOfMonth: 11,
    monthsStep: 1,
    phase: 0,
    amounts: [8250],
    accountId: "checking",
  },
  {
    description: "CONSOLIDATED EDISON",
    category: "utilities",
    dayOfMonth: 15,
    monthsStep: 1,
    phase: 0,
    // Seasonal electric bill: summer/winter peaks, spring dips.
    amounts: [9240, 7810, 6620, 5890, 6100, 7230, 8890, 10420, 11800, 13110, 12640],
    accountId: "checking",
  },
  {
    description: "GEICO AUTO 1234",
    category: "insurance",
    dayOfMonth: 8,
    monthsStep: 3,
    phase: 1,
    amounts: [41250],
    accountId: "checking",
  },
  {
    description: "SUNRISE PROPERTY MGMT RENT",
    category: "housing",
    dayOfMonth: 1,
    monthsStep: 1,
    phase: 0,
    amounts: [215000],
    accountId: "checking",
  },

  // Decoy: annual charge seen once in the window — must NOT be detected.
  {
    description: "AMAZON PRIME MEMBERSHIP",
    category: "shopping",
    dayOfMonth: 20,
    monthsStep: 12,
    phase: 0,
    amounts: [13900],
    accountId: "credit",
  },
];

interface NoiseMerchant {
  description: string;
  category: TransactionCategory;
  minCents: number;
  maxCents: number;
  account: "checking" | "credit";
}

const NOISE: NoiseMerchant[] = [
  {
    description: "TRADER JOE'S #152",
    category: "groceries",
    minCents: 3200,
    maxCents: 9800,
    account: "checking",
  },
  {
    description: "WHOLEFDS MAR 10245",
    category: "groceries",
    minCents: 4100,
    maxCents: 14200,
    account: "checking",
  },
  {
    description: "SQ *BLUE BOTTLE COFFEE",
    category: "dining",
    minCents: 850,
    maxCents: 2400,
    account: "credit",
  },
  {
    description: "CHIPOTLE 2231 SAN FRANCISCO CA",
    category: "dining",
    minCents: 1150,
    maxCents: 3200,
    account: "credit",
  },
  {
    description: "SHELL OIL 573482397",
    category: "transportation",
    minCents: 3800,
    maxCents: 7400,
    account: "checking",
  },
  {
    description: "AMAZON MKTP*US2V3",
    category: "shopping",
    minCents: 1200,
    maxCents: 12400,
    account: "credit",
  },
  {
    description: "UBER *TRIP HELP.UBER.CO",
    category: "transportation",
    minCents: 1100,
    maxCents: 5600,
    account: "credit",
  },
];

const CHECKING_EXTERNAL_ID = "acc_mock_checking_0001";
const CREDIT_EXTERNAL_ID = "acc_mock_credit_0002";

function accountExternalId(account: "checking" | "credit"): string {
  return account === "checking" ? CHECKING_EXTERNAL_ID : CREDIT_EXTERNAL_ID;
}

interface GeneratedTransaction extends PlaidTransactionView {
  seq: number;
}

function buildHistory(accessToken: string, now: Date): GeneratedTransaction[] {
  const tokenHash = hash32(accessToken).toString(36);
  const rng = seededRandom(hash32(`${accessToken}:noise`));
  const transactions: GeneratedTransaction[] = [];
  let seq = 0;

  const push = (
    view: Omit<PlaidTransactionView, "externalId" | "categoryHint">,
    categoryHint: TransactionCategory,
    slug: string,
    dateIso: string,
  ) => {
    seq += 1;
    transactions.push({
      ...view,
      categoryHint,
      externalId: `mock-${tokenHash}-${slug}-${dateIso}-${seq}`,
      seq,
    });
  };

  for (let monthsBack = MONTHS_OF_HISTORY; monthsBack >= 0; monthsBack--) {
    const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));
    const year = monthDate.getUTCFullYear();
    const monthIndex = monthDate.getUTCMonth();
    const monthLength = daysInMonth(year, monthIndex);

    // Recurring series
    for (const series of SERIES) {
      if (monthsBack % series.monthsStep !== series.phase) continue;
      const day = Math.min(series.dayOfMonth, monthLength);
      const occurredAt = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
      if (occurredAt.getTime() > now.getTime()) continue;

      const cycle = Math.floor((MONTHS_OF_HISTORY - monthsBack) / series.monthsStep);
      const amount = series.amounts[cycle] ?? series.amounts[series.amounts.length - 1]!;
      push(
        {
          externalAccountId: accountExternalId(series.accountId),
          occurredAt,
          merchantName: series.description,
          amountCents: amount,
          isPending: false,
        },
        series.category,
        slugify(series.description),
        occurredAt.toISOString().slice(0, 10),
      );
    }

    // Biweekly paycheck (inflow, negative amount)
    for (const payday of [1, 15]) {
      const occurredAt = new Date(Date.UTC(year, monthIndex, payday, 12, 0, 0));
      if (occurredAt.getTime() > now.getTime()) continue;
      push(
        {
          externalAccountId: CHECKING_EXTERNAL_ID,
          occurredAt,
          merchantName: "ACME CORP PAYROLL",
          amountCents: -260000,
          isPending: false,
        },
        "income",
        "payroll",
        occurredAt.toISOString().slice(0, 10),
      );
    }

    // Monthly savings transfer (transfers category — never recurring spend)
    const transferDay = Math.min(27, monthLength);
    const transferAt = new Date(Date.UTC(year, monthIndex, transferDay, 12, 0, 0));
    if (transferAt.getTime() <= now.getTime()) {
      push(
        {
          externalAccountId: CHECKING_EXTERNAL_ID,
          occurredAt: transferAt,
          merchantName: "ONLINE TRANSFER TO SAVINGS",
          amountCents: 50000,
          isPending: false,
        },
        "transfers",
        "transfer-savings",
        transferAt.toISOString().slice(0, 10),
      );
    }

    // Day-to-day noise: 5–8 purchases per month, deterministic per token
    const noiseCount = 5 + Math.floor(rng() * 4);
    for (let i = 0; i < noiseCount; i++) {
      const merchant = NOISE[Math.floor(rng() * NOISE.length)]!;
      const day = 1 + Math.floor(rng() * monthLength);
      const occurredAt = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
      if (occurredAt.getTime() > now.getTime()) continue;
      const span = merchant.maxCents - merchant.minCents;
      const amount = merchant.minCents + Math.round(rng() * span);
      push(
        {
          externalAccountId: accountExternalId(merchant.account),
          occurredAt,
          merchantName: merchant.description,
          amountCents: amount,
          isPending: false,
        },
        merchant.category,
        slugify(merchant.description),
        occurredAt.toISOString().slice(0, 10),
      );
    }
  }

  transactions.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return transactions;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
}

// ── Adapter ─────────────────────────────────────────────────────────────────

export class MockPlaidAdapter implements PlaidAdapter {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async createLinkToken(input: { userId: string }): Promise<PlaidLinkToken> {
    const token = `link-mock-${hash32(`link:${input.userId}:${this.now().toISOString()}`).toString(36)}`;
    const expiration = new Date(this.now().getTime() + 4 * 3_600_000);
    return { linkToken: token, expiration: expiration.toISOString() };
  }

  async exchangePublicToken(publicToken: string): Promise<PlaidExchangeResult> {
    const itemId = `item_mock_${hash32(`item:${publicToken}`).toString(36)}`;
    return { accessToken: `mock-access-${itemId}`, itemId };
  }

  async getAccounts(accessToken: string): Promise<PlaidAccountsResult> {
    const rng = seededRandom(hash32(`${accessToken}:balances`));
    const jitter = (base: number, cents: number) => base + Math.round((rng() - 0.5) * 2 * cents);
    return {
      institutionId: "ins_mock_first_national",
      institutionName: "First National Bank",
      accounts: [
        {
          externalAccountId: CHECKING_EXTERNAL_ID,
          name: "Premier Checking",
          type: "checking",
          mask: "4521",
          balanceCents: jitter(428357, 25000),
          availableCents: jitter(418357, 25000),
          currency: "USD",
        },
        {
          externalAccountId: CREDIT_EXTERNAL_ID,
          name: "Platinum Card",
          type: "credit_card",
          mask: "3312",
          balanceCents: -jitter(128466, 15000), // negative = owed
          availableCents: null,
          currency: "USD",
        },
      ],
    };
  }

  async syncTransactions(accessToken: string, cursor: string | null): Promise<PlaidSyncPage> {
    const history = buildHistory(accessToken, this.now());
    const consumed = parseCursor(cursor);
    const page = history.slice(consumed, consumed + PAGE_SIZE);
    const nextConsumed = consumed + page.length;
    return {
      added: page.map(({ seq: _seq, ...view }) => view),
      modified: [],
      removed: [],
      nextCursor: `mock:v1:${nextConsumed}`,
      hasMore: nextConsumed < history.length,
    };
  }
}

function parseCursor(cursor: string | null): number {
  if (!cursor) return 0;
  const match = /^mock:v1:(\d+)$/.exec(cursor);
  if (!match) return 0; // unknown cursor → restart from the beginning (idempotent)
  return Number.parseInt(match[1]!, 10);
}

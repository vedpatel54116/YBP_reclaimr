import type { MerchantHints, TransactionCategory } from "../types";
import { normalizeMerchant } from "./normalize-merchant";

/**
 * Seed catalog of well-known merchants: display names, default categories,
 * and detection hints. The Merchant table (curated by finance ops) is the
 * runtime source of truth; this catalog bootstraps it and provides defaults
 * for keys the table has not curated yet.
 */
export interface CatalogEntry extends MerchantHints {
  normalizedKey: string;
}

const CATALOG: CatalogEntry[] = [
  // ── Subscription providers ──────────────────────────────────────────────
  {
    normalizedKey: "netflix",
    displayName: "Netflix",
    category: "entertainment",
    isSubscriptionProvider: true,
  },
  {
    normalizedKey: "spotify",
    displayName: "Spotify",
    category: "entertainment",
    isSubscriptionProvider: true,
  },
  {
    normalizedKey: "hulu",
    displayName: "Hulu",
    category: "entertainment",
    isSubscriptionProvider: true,
  },
  {
    normalizedKey: "apple bill itunes",
    displayName: "Apple Music",
    category: "subscriptions",
    isSubscriptionProvider: true,
  },
  {
    normalizedKey: "apple bill icloud",
    displayName: "iCloud+",
    category: "subscriptions",
    isSubscriptionProvider: true,
  },
  {
    normalizedKey: "new york times digital",
    displayName: "The New York Times",
    category: "subscriptions",
    isSubscriptionProvider: true,
  },
  {
    normalizedKey: "adobe creative cloud",
    displayName: "Adobe Creative Cloud",
    category: "subscriptions",
    isSubscriptionProvider: true,
  },
  {
    normalizedKey: "planet fitness",
    displayName: "Planet Fitness",
    category: "fitness",
    isSubscriptionProvider: true,
  },
  {
    normalizedKey: "siriusxm radio",
    displayName: "SiriusXM",
    category: "entertainment",
    isSubscriptionProvider: true,
  },
  {
    normalizedKey: "chewy",
    displayName: "Chewy",
    category: "shopping",
    isSubscriptionProvider: true,
  },
  {
    normalizedKey: "dollarshaveclub",
    displayName: "Dollar Shave Club",
    category: "shopping",
    isSubscriptionProvider: true,
  },
  {
    normalizedKey: "amazon prime",
    displayName: "Amazon Prime",
    category: "shopping",
    isSubscriptionProvider: true,
  },
  {
    normalizedKey: "google storage",
    displayName: "Google One",
    category: "subscriptions",
    isSubscriptionProvider: true,
  },

  // ── Billers ─────────────────────────────────────────────────────────────
  {
    normalizedKey: "comcast xfinity internet",
    displayName: "Xfinity Internet",
    category: "telecommunications",
    negotiable: true,
  },
  {
    normalizedKey: "xfinity",
    displayName: "Xfinity",
    category: "telecommunications",
    negotiable: true,
  },
  {
    normalizedKey: "verizon wireless",
    displayName: "Verizon Wireless",
    category: "telecommunications",
    negotiable: true,
  },
  { normalizedKey: "at&t", displayName: "AT&T", category: "telecommunications", negotiable: true },
  {
    normalizedKey: "t-mobile",
    displayName: "T-Mobile",
    category: "telecommunications",
    negotiable: true,
  },
  { normalizedKey: "consolidated edison", displayName: "Con Edison", category: "utilities" },
  { normalizedKey: "pg&e", displayName: "Pacific Gas & Electric", category: "utilities" },
  { normalizedKey: "geico", displayName: "GEICO", category: "insurance", negotiable: true },
  {
    normalizedKey: "state farm",
    displayName: "State Farm",
    category: "insurance",
    negotiable: true,
  },
  {
    normalizedKey: "progressive",
    displayName: "Progressive",
    category: "insurance",
    negotiable: true,
  },
  { normalizedKey: "allstate", displayName: "Allstate", category: "insurance", negotiable: true },
  {
    normalizedKey: "sunrise property mgmt",
    displayName: "Sunrise Property Management",
    category: "housing",
  },

  // ── Flows (never recurring spend; keep them out of detection) ───────────
  { normalizedKey: "acme corp payroll", displayName: "ACME Corp Payroll", category: "income" },
  {
    normalizedKey: "online transfer savings",
    displayName: "Transfer to Savings",
    category: "transfers",
  },
];

// Pre-normalize each entry's own key so lookups are plain string comparisons.
const INDEX = new Map<string, CatalogEntry>();
for (const entry of CATALOG) {
  INDEX.set(normalizeMerchant(entry.normalizedKey), entry);
}

const INDEX_KEYS = [...INDEX.keys()].sort((a, b) => b.length - a.length);

/**
 * Look up catalog hints for a merchant key (normalized defensively — callers
 * pass normalized keys, but hyphenated forms like "t-mobile" normalize to
 * "t mobile", so accepting either keeps lookups forgiving). A catalog key
 * matches when it equals the lookup key or is a token-prefix of it (so
 * "geico auto" matches "geico"). Longest catalog key wins.
 */
export function findCatalogHints(merchantKey: string): CatalogEntry | null {
  const normalizedKey = normalizeMerchant(merchantKey);
  const direct = INDEX.get(normalizedKey);
  if (direct) return direct;
  for (const key of INDEX_KEYS) {
    if (normalizedKey.startsWith(`${key} `)) return INDEX.get(key) ?? null;
  }
  return null;
}

/** Categories that represent fixed life admin — bills, never subscriptions. */
export const BILL_CATEGORIES: ReadonlySet<TransactionCategory> = new Set([
  "housing",
  "utilities",
  "telecommunications",
  "insurance",
] as TransactionCategory[]);

/** Categories never considered recurring charges (flows, not purchases). */
export const NON_PURCHASE_CATEGORIES: ReadonlySet<TransactionCategory> = new Set([
  "income",
  "transfers",
  "savings",
  "fees",
] as TransactionCategory[]);

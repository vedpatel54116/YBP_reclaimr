/**
 * Merchant normalization: turn noisy bank-statement descriptions into a
 * canonical grouping key. Ported from legacy/server/src/lib/detect.js with
 * the ARCHITECTURE.md Appendix B corrections (pure function, typed).
 *
 *   "PLANET FITNESS #0242"      → "planet fitness"
 *   "NETFLIX.COM 405882 RE"    → "netflix re"
 *   "SQ *BLUE BOTTLE COFFEE"   → "sq blue bottle coffee"
 */

const NOISE_TOKENS = new Set([
  "pos",
  "preauth",
  "auth",
  "authorized",
  "purchase",
  "debit",
  "credit",
  "visa",
  "mastercard",
  "recurring",
  "payment",
  "pymt",
  "inc",
  "llc",
  "usa",
  "us",
  "com",
  "net",
  "store",
  "the",
  "and",
  "of",
  "re",
]);

export const UNKNOWN_MERCHANT_KEY = "unknown";

/** Raw statement description → normalized grouping key. */
export function normalizeMerchant(raw: string): string {
  let m = raw.toLowerCase();
  m = m.replace(/#\d+/g, " "); // store numbers: PLANET FITNESS #0242
  m = m.replace(/\b\d{2,}\b/g, " "); // standalone numbers (refs, phone fragments)
  m = m.replace(/\*/g, " "); // SQ *BLUE BOTTLE, AMAZON PRIME*ME
  m = m.replace(/[^a-z& ]+/g, " ");
  const tokens = m.split(/\s+/).filter((t) => t.length > 0 && !NOISE_TOKENS.has(t));
  return tokens.slice(0, 3).join(" ") || UNKNOWN_MERCHANT_KEY;
}

export function titleCase(key: string): string {
  return key.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

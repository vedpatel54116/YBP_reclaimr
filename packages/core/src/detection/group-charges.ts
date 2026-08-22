import type { DetectionTransaction } from "../types";
import { normalizeMerchant } from "./normalize-merchant";

/**
 * Group charge transactions by normalized merchant key, preserving the input
 * order within each group. Callers sort groups chronologically themselves.
 */
export function groupChargesByMerchant(
  transactions: readonly DetectionTransaction[],
): Map<string, DetectionTransaction[]> {
  const groups = new Map<string, DetectionTransaction[]>();
  for (const txn of transactions) {
    const key = normalizeMerchant(txn.merchantName);
    const bucket = groups.get(key);
    if (bucket) bucket.push(txn);
    else groups.set(key, [txn]);
  }
  return groups;
}

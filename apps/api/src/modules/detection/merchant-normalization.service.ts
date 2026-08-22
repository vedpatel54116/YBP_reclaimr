import type { Merchant, PrismaClient } from "@prisma/client";
import {
  findCatalogHints,
  normalizeMerchant,
  titleCase,
  UNKNOWN_MERCHANT_KEY,
  type MerchantHints,
} from "@reclaimr/core";
import type { TransactionCategory } from "@reclaimr/shared";

export interface MerchantResolution {
  merchantId: string;
  /** Catalog-informed default category; "other" when unknown. */
  category: TransactionCategory;
  hints: MerchantHints;
}

/**
 * Merchant normalization: maps raw statement descriptions onto canonical
 * Merchant rows (creating them lazily from the core catalog). Detection
 * groups by the same normalized keys, so a charge posted as
 * "PLANET FITNESS #0242" and one posted as "PLANET FITNESS" resolve to one
 * merchant and one recurring series.
 */
export class MerchantNormalizationService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Resolve many raw descriptions in one pass (one upsert per distinct
   * normalized key). Returns raw description → resolution.
   */
  async resolveMany(rawNames: readonly string[]): Promise<Map<string, MerchantResolution>> {
    const byKey = new Map<string, string[]>(); // key → raw names
    for (const name of rawNames) {
      const key = normalizeMerchant(name);
      const bucket = byKey.get(key);
      if (bucket) bucket.push(name);
      else byKey.set(key, [name]);
    }

    const keyResolutions = await this.resolveByKeys([...byKey.keys()]);
    const resolutions = new Map<string, MerchantResolution>();
    for (const [key, names] of byKey) {
      const resolution = keyResolutions.get(key);
      if (!resolution) continue;
      for (const name of names) resolutions.set(name, resolution);
    }
    return resolutions;
  }

  /** Resolve by normalized merchant key — the same grouping detection uses. */
  async resolveByKeys(keys: readonly string[]): Promise<Map<string, MerchantResolution>> {
    const resolutions = new Map<string, MerchantResolution>();
    for (const key of keys) {
      resolutions.set(key, await this.resolveKey(key));
    }
    return resolutions;
  }

  async resolveOne(rawName: string): Promise<MerchantResolution> {
    return this.resolveKey(normalizeMerchant(rawName));
  }

  private async resolveKey(key: string): Promise<MerchantResolution> {
    const catalog = findCatalogHints(key);
    const displayName = catalog?.displayName ?? titleCase(key);
    const merchant: Merchant = await this.prisma.merchant.upsert({
      where: { normalizedKey: key },
      create: {
        normalizedKey: key,
        canonicalName: displayName,
        category: catalog?.category ?? "other",
        isSubscriptionProvider: catalog?.isSubscriptionProvider ?? false,
        negotiable: catalog?.negotiable ?? false,
        aliases: [],
      },
      update: {}, // curation happens in the admin console; never clobber it
    });
    return {
      merchantId: merchant.id,
      category: merchant.category,
      hints: {
        displayName: merchant.canonicalName,
        category: merchant.category,
        isSubscriptionProvider: merchant.isSubscriptionProvider,
        negotiable: merchant.negotiable,
      },
    };
  }

  /**
   * True when normalization collapsed a description to pure noise.
   */
  static isUnknown(rawName: string): boolean {
    return normalizeMerchant(rawName) === UNKNOWN_MERCHANT_KEY;
  }
}

/**
 * Final category for a transaction row: the curated merchant category wins
 * when it is known; otherwise the aggregator's hint (if any) is used.
 */
export function effectiveCategory(
  resolutionCategory: TransactionCategory,
  sourceHint: TransactionCategory | null,
): TransactionCategory {
  return resolutionCategory !== "other" ? resolutionCategory : (sourceHint ?? "other");
}

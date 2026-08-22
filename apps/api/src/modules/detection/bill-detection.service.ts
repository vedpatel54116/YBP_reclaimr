import type { PrismaClient, Transaction } from "@prisma/client";
import {
  detectBills,
  normalizeMerchant,
  type DetectionTransaction,
  type MerchantHintTable,
} from "@reclaimr/core";
import type { MerchantNormalizationService } from "./merchant-normalization.service";
import type { DetectionRunResult } from "./subscription-detection.service";

/**
 * Bill detection: the same engine core, run over bill categories only
 * (housing, utilities, telecommunications, insurance) with variable amounts
 * tolerated and a due day derived from the charge calendar. Bills are kept
 * in their own table — separate from subscriptions — because the product
 * treats them differently: negotiable, not cancellable.
 *
 * Alerts for bills flow from the alert evaluator (upcoming_bill), not from
 * detection itself.
 */
export class BillDetectionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly merchants: MerchantNormalizationService,
  ) {}

  async runForUser(userId: string, now: Date = new Date()): Promise<DetectionRunResult> {
    const rows: Array<Transaction & { merchant: { normalizedKey: string } | null }> =
      await this.prisma.transaction.findMany({
        where: {
          userId,
          isPending: false,
          occurredAt: { gte: new Date(now.getTime() - 400 * 86_400_000) },
        },
        include: { merchant: { select: { normalizedKey: true } } },
        orderBy: { occurredAt: "asc" },
      });

    const distinctKeys = [
      ...new Set(rows.map((r) => r.merchant?.normalizedKey ?? normalizeMerchant(r.merchantName))),
    ];
    const keyResolutions = await this.merchants.resolveByKeys(distinctKeys);
    const hints: MerchantHintTable = new Map(
      [...keyResolutions.entries()].map(([key, resolution]) => [key, resolution.hints]),
    );

    const coreInput: DetectionTransaction[] = rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt,
      merchantName: row.merchantName,
      amountCents: row.amountCents,
      category: row.category,
    }));
    const detected = detectBills(coreInput, { now, merchantHints: hints });

    let created = 0;
    let updated = 0;

    for (const bill of detected) {
      if (!bill.isActive) continue;
      const merchantId = keyResolutions.get(bill.merchantKey)?.merchantId;
      if (!merchantId) continue;

      const lastTxn = rows.find(
        (r) => r.id === bill.transactionIds[bill.transactionIds.length - 1],
      );

      const existing = await this.prisma.bill.findFirst({
        where: { userId, merchantId, isActive: true },
      });

      const data = {
        expectedAmountCents: bill.expectedAmountCents,
        lastAmountCents: bill.lastAmountCents,
        dueDay: bill.dueDay,
        cadence: bill.cadence,
        negotiable: bill.negotiable,
        confidence: bill.confidence,
        ...(lastTxn ? { connectedAccountId: lastTxn.accountId } : {}),
      };

      if (!existing) {
        await this.prisma.bill.create({
          data: { userId, merchantId, name: bill.displayName, category: bill.category, ...data },
        });
        created += 1;
      } else {
        await this.prisma.bill.update({ where: { id: existing.id }, data });
        updated += 1;
      }
    }

    const flaggedIds = detected.flatMap((bill) => bill.transactionIds);
    if (flaggedIds.length > 0) {
      await this.prisma.transaction.updateMany({
        where: { id: { in: flaggedIds } },
        data: { isRecurring: true },
      });
    }

    return {
      detected: detected.length,
      created,
      updated,
      flagged: flaggedIds.length,
      alertsCreated: 0,
    };
  }
}

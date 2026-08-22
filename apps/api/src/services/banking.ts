import type { PrismaClient } from "@prisma/client";
import type { JobProducer } from "@reclaimr/queue";
import { TokenCipher } from "../adapters/crypto/token-cipher";
import { createPlaidAdapter, type PlaidAdapter } from "../adapters/plaid";
import { bankTokenKey, type Env } from "../env";
import { AccountService } from "../modules/accounts/account.service";
import { PlaidLinkService } from "../modules/accounts/plaid-link.service";
import { AlertService } from "../modules/alerts/alert.service";
import { BillDetectionService } from "../modules/detection/bill-detection.service";
import { MerchantNormalizationService } from "../modules/detection/merchant-normalization.service";
import { SubscriptionDetectionService } from "../modules/detection/subscription-detection.service";
import { SyncPipeline } from "../modules/detection/sync-pipeline";
import { SavingsCalculationService } from "../modules/savings/savings-calculation.service";
import { TransactionService } from "../modules/transactions/service";
import { TransactionSyncService } from "../modules/transactions/transaction-sync.service";

export interface BankingServices {
  plaidLink: PlaidLinkService;
  accounts: AccountService;
  transactions: TransactionService;
  transactionSync: TransactionSyncService;
  merchantNormalization: MerchantNormalizationService;
  subscriptionDetection: SubscriptionDetectionService;
  billDetection: BillDetectionService;
  alerts: AlertService;
  savings: SavingsCalculationService;
  syncPipeline: SyncPipeline;
}

/**
 * Composition root for the banking pipeline. Constructed once per process:
 * by the Fastify app for HTTP requests, and by apps/worker for background
 * jobs — the same service instances and code paths in both.
 */
export function createBankingServices(
  prisma: PrismaClient,
  config: Env,
  options: {
    queue?: JobProducer | null;
    adapter?: PlaidAdapter;
    /** AI advisor for the inline (no-Redis) path; omitted, advice is queued. */
    advisor?: { runForUser(userId: string): Promise<number> };
  } = {},
): BankingServices {
  const adapter = options.adapter ?? createPlaidAdapter(config);
  const cipher = new TokenCipher(bankTokenKey(config));
  const queue = options.queue ?? null;

  const merchantNormalization = new MerchantNormalizationService(prisma);
  const alerts = new AlertService(prisma);
  const transactionSync = new TransactionSyncService(
    prisma,
    adapter,
    cipher,
    merchantNormalization,
    alerts,
  );
  const subscriptionDetection = new SubscriptionDetectionService(
    prisma,
    merchantNormalization,
    alerts,
  );
  const billDetection = new BillDetectionService(prisma, merchantNormalization);

  return {
    plaidLink: new PlaidLinkService(prisma, adapter, cipher),
    accounts: new AccountService(prisma),
    transactions: new TransactionService(prisma),
    transactionSync,
    merchantNormalization,
    subscriptionDetection,
    billDetection,
    alerts,
    savings: new SavingsCalculationService(prisma),
    syncPipeline: new SyncPipeline({
      queue,
      syncTransactions: transactionSync,
      detectSubscriptions: subscriptionDetection,
      detectBills: billDetection,
      evaluateAlerts: alerts,
      refreshAdvice: options.advisor,
    }),
  };
}

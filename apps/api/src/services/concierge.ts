import type { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import { TokenCipher } from "../adapters/crypto/token-cipher";
import { createBillingAdapter, type BillingAdapter } from "../adapters/stripe";
import { createStorageAdapter, type StorageAdapter } from "../adapters/storage";
import { adminTokenSecret, type Env } from "../env";
import { AdminAuthService } from "../modules/admin/auth.service";
import { AdminCaseService } from "../modules/admin/cases.service";
import {
  AdminAuditService,
  AdminMemberService,
  AdminMerchantService,
} from "../modules/admin/console.service";
import { BillService } from "../modules/bills/service";
import { PremiumService } from "../modules/billing/premium.service";
import { BillingWebhookService } from "../modules/billing/webhook.service";
import { CancellationService } from "../modules/cancellations/service";
import { NegotiationDocumentService } from "../modules/negotiations/document.service";
import { NegotiationService } from "../modules/negotiations/service";
import { SavingsCalculationService } from "../modules/savings/savings-calculation.service";
import { SavingsEventService } from "../modules/savings/savings-event.service";
import { AuditService } from "./audit";
import { SavingsLedger } from "./savings-ledger";

/**
 * Composition root for the concierge, billing, and staff-console services.
 *
 * Built once per process and shared by the route modules, mirroring
 * `createBankingServices`. Wiring lives here rather than inside route plugins so
 * a single `SavingsLedger` instance backs both case types — the exactly-once
 * guarantee on the reclaimed ledger is easier to reason about with one writer.
 */
export interface ConciergeServices {
  audit: AuditService;
  savingsLedger: SavingsLedger;
  cancellations: CancellationService;
  negotiations: NegotiationService;
  negotiationDocuments: NegotiationDocumentService;
  bills: BillService;
  savingsCalculations: SavingsCalculationService;
  savingsEvents: SavingsEventService;
  premium: PremiumService;
  billingWebhooks: BillingWebhookService;
  billingAdapter: BillingAdapter;
  storage: StorageAdapter;
  admin: {
    auth: AdminAuthService;
    cases: AdminCaseService;
    members: AdminMemberService;
    merchants: AdminMerchantService;
    auditLogs: AdminAuditService;
  };
}

export interface ConciergeServiceOverrides {
  /** Injected by tests to avoid real provider calls. */
  billingAdapter?: BillingAdapter;
  storage?: StorageAdapter;
}

export function createConciergeServices(
  prisma: PrismaClient,
  config: Env,
  logger: FastifyBaseLogger,
  overrides: ConciergeServiceOverrides = {},
): ConciergeServices {
  const audit = new AuditService(prisma, logger);
  const savingsLedger = new SavingsLedger(prisma);
  const billingAdapter = overrides.billingAdapter ?? createBillingAdapter(config);
  const storage = overrides.storage ?? createStorageAdapter(config);

  // MFA seeds get their own key-derivation domain, so a bank-token ciphertext
  // and an MFA ciphertext are never interchangeable.
  const mfaCipher = new TokenCipher(adminTokenSecret(config), "reclaimr:admin-mfa:v1");

  const cancellations = new CancellationService(prisma, audit, savingsLedger);
  const negotiations = new NegotiationService(prisma, audit, savingsLedger);

  return {
    audit,
    savingsLedger,
    cancellations,
    negotiations,
    negotiationDocuments: new NegotiationDocumentService(prisma, storage, audit),
    bills: new BillService(prisma),
    savingsCalculations: new SavingsCalculationService(prisma),
    savingsEvents: new SavingsEventService(prisma, savingsLedger, audit),
    premium: new PremiumService(prisma, billingAdapter, audit, config),
    billingWebhooks: new BillingWebhookService(prisma, audit, logger),
    billingAdapter,
    storage,
    admin: {
      auth: new AdminAuthService(prisma, audit, mfaCipher, config),
      cases: new AdminCaseService(prisma),
      members: new AdminMemberService(prisma),
      merchants: new AdminMerchantService(prisma, audit),
      auditLogs: new AdminAuditService(prisma),
    },
  };
}

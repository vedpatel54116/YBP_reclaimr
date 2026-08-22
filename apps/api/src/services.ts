/**
 * Server-code barrel for apps/worker. Exports ONLY service classes, the
 * service factory, adapters, and configuration — never the Fastify app or
 * route handlers — so bundling this entry never drags in an HTTP server.
 */
export {
  env,
  plaidEnabled,
  llmEnabled,
  stripeEnabled,
  bankTokenKey,
  adminTokenSecret,
  adminMfaRequired,
  corsOrigin,
  type Env,
} from "./env";

export { TokenCipher } from "./adapters/crypto/token-cipher";
export {
  createPlaidAdapter,
  MockPlaidAdapter,
  PlaidHttpAdapter,
  PlaidAdapterError,
  type PlaidAdapter,
} from "./adapters/plaid";
export {
  createLlmAdapter,
  MockLlmAdapter,
  OpenAiAdapter,
  LlmAdapterError,
  type LlmAdapter,
  type LlmCompletionInput,
  type LlmCompletionResult,
} from "./adapters/llm";
export { createBankingServices, type BankingServices } from "./services/banking";
export {
  createConciergeServices,
  type ConciergeServices,
  type ConciergeServiceOverrides,
} from "./services/concierge";
export { SavingsLedger, type LedgerEntry, type LedgerResult } from "./services/savings-ledger";
export { createStorageAdapter, LocalStorageAdapter, StorageError } from "./adapters/storage";
export type { StorageAdapter } from "./adapters/storage";
export {
  createBillingAdapter,
  MockBillingAdapter,
  StripeBillingAdapter,
  BillingAdapterError,
} from "./adapters/stripe";
export type {
  BillingAdapter,
  BillingEvent,
  BillingSubscription,
  CheckoutSession,
  CreateCheckoutSession,
} from "./adapters/stripe";
export { AccountService } from "./modules/accounts/account.service";
export { PlaidLinkService } from "./modules/accounts/plaid-link.service";
export { TransactionService } from "./modules/transactions/service";
export { TransactionSyncService } from "./modules/transactions/transaction-sync.service";
export { MerchantNormalizationService } from "./modules/detection/merchant-normalization.service";
export { SubscriptionDetectionService } from "./modules/detection/subscription-detection.service";
export { BillDetectionService } from "./modules/detection/bill-detection.service";
export { SyncPipeline } from "./modules/detection/sync-pipeline";
export { AlertService } from "./modules/alerts/alert.service";
export { SavingsCalculationService } from "./modules/savings/savings-calculation.service";
export { SavingsEventService } from "./modules/savings/savings-event.service";
export { BillService } from "./modules/bills/service";
export { CancellationService } from "./modules/cancellations/service";
export { NegotiationService } from "./modules/negotiations/service";
export { NegotiationDocumentService } from "./modules/negotiations/document.service";
export { PremiumService } from "./modules/billing/premium.service";
export { BillingWebhookService } from "./modules/billing/webhook.service";
export { AdminAuthService } from "./modules/admin/auth.service";
export { AdminCaseService } from "./modules/admin/cases.service";
export {
  AdminAuditService,
  AdminMemberService,
  AdminMerchantService,
} from "./modules/admin/console.service";
export {
  roleHasCapability,
  ROLE_CAPABILITIES,
  type AdminCapability,
} from "./modules/admin/permissions";
export { createAiServices, type AiServices, type AiServiceOverrides } from "./services/ai";
export { AlternativeAdvisorService } from "./modules/ai/alternative-advisor.service";

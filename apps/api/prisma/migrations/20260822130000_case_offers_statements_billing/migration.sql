-- Concierge case offers, statement uploads, premium billing intervals, and
-- Stripe webhook idempotency.
--
-- Three concerns land together because they are one product story: a
-- negotiation now ends with the *member* approving a secured rate (which is
-- what books the success fee), members can attach statements so the concierge
-- can quote a provider, and premium is billed through Stripe on a monthly or
-- yearly cadence with exactly-once webhook handling.

-- AlterEnum: `offer_pending` is the negotiation state where a secured rate is
-- waiting on the member. Postgres allows adding a value in a specific position,
-- which keeps the enum ordered by lifecycle rather than by when it was added.
ALTER TYPE "CaseStatus" ADD VALUE 'offer_pending' AFTER 'in_progress';

-- CreateEnum
CREATE TYPE "PremiumInterval" AS ENUM ('monthly', 'yearly');

-- AlterTable: the offer round-trip on a negotiation.
ALTER TABLE "negotiation_cases" ADD COLUMN     "offeredAnnualSavingsCents" INTEGER,
ADD COLUMN     "offerNote" TEXT,
ADD COLUMN     "offeredAt" TIMESTAMP(3),
ADD COLUMN     "offerRespondedAt" TIMESTAMP(3);

-- CreateTable: statement metadata. Bytes live in object storage; `storageKey`
-- is userId-prefixed so a leaked key cannot address another member's file.
CREATE TABLE "negotiation_documents" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "negotiationCaseId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negotiation_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "negotiation_documents_storageKey_key" ON "negotiation_documents"("storageKey");
CREATE INDEX "negotiation_documents_negotiationCaseId_idx" ON "negotiation_documents"("negotiationCaseId");
CREATE INDEX "negotiation_documents_userId_idx" ON "negotiation_documents"("userId");

-- AddForeignKey
ALTER TABLE "negotiation_documents" ADD CONSTRAINT "negotiation_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "negotiation_documents" ADD CONSTRAINT "negotiation_documents_negotiationCaseId_fkey" FOREIGN KEY ("negotiationCaseId") REFERENCES "negotiation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: premium billing cadence. Existing rows are monthly by definition
-- (the yearly plan did not exist), so the default backfills them correctly.
ALTER TABLE "premium_subscriptions" ADD COLUMN     "interval" "PremiumInterval" NOT NULL DEFAULT 'monthly';

-- CreateIndex: one local row per Stripe subscription, so webhook handlers can
-- resolve a delivery to a member by subscription id alone.
CREATE UNIQUE INDEX "premium_subscriptions_externalSubscriptionId_key" ON "premium_subscriptions"("externalSubscriptionId");
CREATE INDEX "premium_subscriptions_externalCustomerId_idx" ON "premium_subscriptions"("externalCustomerId");

-- CreateTable: processed webhook ids. Stripe delivers at-least-once, so each
-- handler inserts here first; a duplicate delivery trips the primary key and is
-- acknowledged without re-applying its side effects.
CREATE TABLE "stripe_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stripe_events_type_processedAt_idx" ON "stripe_events"("type", "processedAt");

-- CreateIndex: exactly-once savings per originating case. Postgres treats
-- NULLs as distinct, so manual adjustments (sourceId NULL) stay unconstrained
-- while a case can never be credited twice by a retry or double-approval.
CREATE UNIQUE INDEX "savings_events_sourceType_sourceId_key" ON "savings_events"("sourceType", "sourceId");

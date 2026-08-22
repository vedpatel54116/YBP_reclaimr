-- AI feature storage: the curated alternatives catalog and the cache of
-- generated artifacts.
--
-- Two tables, two lifetimes. `alternative_options` is global reference data
-- maintained by finance ops (like `merchants`) and is the source of truth for
-- prices — savings deltas are computed from these integers, never from model
-- output. `ai_suggestions` is a per-member cache keyed uniquely on
-- (kind, subjectId), so regeneration is an upsert: a failed run leaves the
-- last good content in place instead of blanking the member's page.

-- CreateEnum
CREATE TYPE "AiSuggestionKind" AS ENUM ('alternative_advice', 'alert_reasoning', 'digest', 'cancellation_plan', 'negotiation_script');

-- CreateTable
CREATE TABLE "alternative_options" (
    "id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyPriceCents" INTEGER NOT NULL,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tradeoffs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "replaces" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alternative_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_suggestions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "AiSuggestionKind" NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "summary" TEXT,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alternative_options_category_isActive_idx" ON "alternative_options"("category", "isActive");

-- CreateIndex
CREATE INDEX "ai_suggestions_userId_kind_idx" ON "ai_suggestions"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ai_suggestions_kind_subjectId_key" ON "ai_suggestions"("kind", "subjectId");

-- AddForeignKey
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

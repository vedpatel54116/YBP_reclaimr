-- Plaid item tracking (encrypted access token + sync cursor) and per-account
-- aggregator ids. One Plaid item owns several ConnectedAccounts; the sync
-- cursor makes /transactions/sync pulls idempotent and resumable.

-- CreateTable
CREATE TABLE "plaid_items" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "externalItemId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "institutionId" TEXT,
    "institutionName" TEXT NOT NULL,
    "syncCursor" TEXT,
    "status" "AccountConnectionStatus" NOT NULL DEFAULT 'connected',
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plaid_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE UNIQUE INDEX "plaid_items_externalItemId_key" ON "plaid_items"("externalItemId");
CREATE INDEX "plaid_items_userId_idx" ON "plaid_items"("userId");

-- AlterTable: re-key ConnectedAccount from item-scoped unique to (item, account).
ALTER TABLE "connected_accounts" DROP COLUMN "externalItemId";
ALTER TABLE "connected_accounts" ADD COLUMN     "plaidItemId" UUID,
ADD COLUMN     "externalAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "connected_accounts_plaidItemId_externalAccountId_key" ON "connected_accounts"("plaidItemId", "externalAccountId");
CREATE INDEX "connected_accounts_plaidItemId_idx" ON "connected_accounts"("plaidItemId");

-- AddForeignKey
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "plaid_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plaid_items" ADD CONSTRAINT "plaid_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: detection confidence for auto-detected bills.
ALTER TABLE "bills" ADD COLUMN     "confidence" DOUBLE PRECISION;

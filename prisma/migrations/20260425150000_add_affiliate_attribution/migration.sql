-- CreateTable
CREATE TABLE "AffiliateAttribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "shop" TEXT,
    "affiliateHandle" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateAttribution_clientId_key" ON "AffiliateAttribution"("clientId");
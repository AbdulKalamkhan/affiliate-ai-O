-- Phase-04: publish approvals table (replaces the hardcoded QA bypass).
-- Purely additive: creates one table and two indexes. No data is modified.

-- CreateTable
CREATE TABLE "publish_approvals" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" JSONB,
    "source" TEXT NOT NULL DEFAULT 'owner',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publish_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "publish_approvals_assetId_grantedAt_idx" ON "publish_approvals"("assetId", "grantedAt");

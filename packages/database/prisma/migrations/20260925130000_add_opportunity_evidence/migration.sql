-- CreateTable
CREATE TABLE "opportunity_evidence" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "factor" TEXT NOT NULL,
    "quality" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "claim" TEXT NOT NULL,
    "source" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opportunity_evidence_opportunityId_factor_idx" ON "opportunity_evidence"("opportunityId", "factor");

-- AddForeignKey
ALTER TABLE "opportunity_evidence" ADD CONSTRAINT "opportunity_evidence_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
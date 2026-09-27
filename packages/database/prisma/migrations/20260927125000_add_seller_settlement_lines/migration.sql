-- CreateTable
CREATE TABLE "seller_settlement_lines" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "source" TEXT NOT NULL DEFAULT 'asserted_by_operator',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seller_settlement_lines_settlementId_kind_idx" ON "seller_settlement_lines"("settlementId", "kind");

-- CreateIndex
CREATE INDEX "seller_settlement_lines_kind_createdAt_idx" ON "seller_settlement_lines"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "seller_settlement_lines" ADD CONSTRAINT "seller_settlement_lines_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "seller_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

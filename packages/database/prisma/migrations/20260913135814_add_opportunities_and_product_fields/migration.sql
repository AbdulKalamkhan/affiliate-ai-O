-- AlterTable
ALTER TABLE "affiliate_links" ADD COLUMN     "productCurrency" TEXT,
ADD COLUMN     "productImageUrl" TEXT,
ADD COLUMN     "productPrice" TEXT,
ADD COLUMN     "productTitle" TEXT;

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'researching',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opportunities_status_idx" ON "opportunities"("status");

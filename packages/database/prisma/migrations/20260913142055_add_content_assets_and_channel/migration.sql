-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('PINTEREST');

-- AlterTable
ALTER TABLE "affiliate_links" ADD COLUMN     "channel" "Channel" NOT NULL DEFAULT 'PINTEREST';

-- CreateTable
CREATE TABLE "content_assets" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "linkId" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "disclosureAdded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_assets_linkId_idx" ON "content_assets"("linkId");

-- CreateIndex
CREATE INDEX "content_assets_published_idx" ON "content_assets"("published");

-- AddForeignKey
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "affiliate_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

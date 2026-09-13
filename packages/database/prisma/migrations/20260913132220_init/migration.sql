-- CreateTable
CREATE TABLE "affiliate_links" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "offer" TEXT,
    "campaign" TEXT,
    "destination" TEXT NOT NULL,
    "trackingParams" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_link_clicks" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "country" TEXT,
    "referrer" TEXT,
    "userAgent" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_link_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceId" TEXT,
    "eventType" TEXT NOT NULL DEFAULT 'sale',
    "value" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "linkId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profit_records" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'affiliate',
    "source" TEXT NOT NULL,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "feeAmount" DECIMAL(12,2) NOT NULL,
    "costAmount" DECIMAL(12,2) NOT NULL,
    "netProfit" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "revenueEventId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'recorded',

    CONSTRAINT "profit_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "affiliate_links_provider_createdAt_idx" ON "affiliate_links"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "affiliate_link_clicks_linkId_occurredAt_idx" ON "affiliate_link_clicks"("linkId", "occurredAt");

-- CreateIndex
CREATE INDEX "revenue_events_provider_occurredAt_idx" ON "revenue_events"("provider", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_events_provider_sourceId_key" ON "revenue_events"("provider", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "profit_records_revenueEventId_key" ON "profit_records"("revenueEventId");

-- CreateIndex
CREATE INDEX "profit_records_sourceType_recordedAt_idx" ON "profit_records"("sourceType", "recordedAt");

-- AddForeignKey
ALTER TABLE "affiliate_link_clicks" ADD CONSTRAINT "affiliate_link_clicks_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "affiliate_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_events" ADD CONSTRAINT "revenue_events_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "affiliate_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_records" ADD CONSTRAINT "profit_records_revenueEventId_fkey" FOREIGN KEY ("revenueEventId") REFERENCES "revenue_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

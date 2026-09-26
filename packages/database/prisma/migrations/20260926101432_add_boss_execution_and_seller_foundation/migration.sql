-- CreateEnum
CREATE TYPE "SellerPlatform" AS ENUM ('AMAZON_SELLER', 'FLIPKART_SELLER', 'MEESHO_SUPPLIER');

-- CreateTable
CREATE TABLE "boss_approvals" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boss_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_tool_calls" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "durationMs" INTEGER,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boss_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_decisions" (
    "id" TEXT NOT NULL,
    "commandId" TEXT,
    "decision" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "factors" JSONB,
    "confidence" DECIMAL(4,2),
    "outcome" TEXT,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boss_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_memory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "weight" DECIMAL(6,3) NOT NULL DEFAULT 1.0,
    "confidence" DECIMAL(4,2),
    "source" TEXT,
    "tags" JSONB,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boss_memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_lessons" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT,
    "commandId" TEXT,
    "actionId" TEXT,
    "prediction" TEXT,
    "actual" TEXT,
    "success" BOOLEAN,
    "lesson" TEXT NOT NULL,
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boss_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_accounts" (
    "id" TEXT NOT NULL,
    "platform" "SellerPlatform" NOT NULL,
    "displayName" TEXT NOT NULL,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_permissions" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "costPrice" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT,
    "attributes" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_listings" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "productId" TEXT,
    "externalId" TEXT,
    "platform" "SellerPlatform" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "bullets" JSONB,
    "attributes" JSONB,
    "price" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_listing_versions" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "externalId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_listing_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_inventories" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT,
    "availableQty" INTEGER NOT NULL DEFAULT 0,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "soldQty" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_orders" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "platform" "SellerPlatform" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "totalPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "seller_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_returns" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "orderId" TEXT,
    "externalId" TEXT,
    "platform" "SellerPlatform" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "reason" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_settlements" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "externalId" TEXT,
    "platform" "SellerPlatform" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "fees" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refunds" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "boss_approvals_actionId_status_idx" ON "boss_approvals"("actionId", "status");

-- CreateIndex
CREATE INDEX "boss_tool_calls_actionId_status_idx" ON "boss_tool_calls"("actionId", "status");

-- CreateIndex
CREATE INDEX "boss_decisions_commandId_createdAt_idx" ON "boss_decisions"("commandId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "boss_memory_key_key" ON "boss_memory"("key");

-- CreateIndex
CREATE INDEX "boss_memory_kind_lastSeenAt_idx" ON "boss_memory"("kind", "lastSeenAt");

-- CreateIndex
CREATE INDEX "boss_lessons_success_createdAt_idx" ON "boss_lessons"("success", "createdAt");

-- CreateIndex
CREATE INDEX "seller_accounts_platform_status_idx" ON "seller_accounts"("platform", "status");

-- CreateIndex
CREATE INDEX "seller_permissions_sellerId_granted_idx" ON "seller_permissions"("sellerId", "granted");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_sku_active_idx" ON "products"("sku", "active");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_productId_active_idx" ON "product_variants"("productId", "active");

-- CreateIndex
CREATE INDEX "seller_listings_sellerId_platform_status_idx" ON "seller_listings"("sellerId", "platform", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seller_listing_versions_listingId_version_key" ON "seller_listing_versions"("listingId", "version");

-- CreateIndex
CREATE INDEX "seller_inventories_sellerId_sku_idx" ON "seller_inventories"("sellerId", "sku");

-- CreateIndex
CREATE INDEX "seller_orders_sellerId_status_createdAt_idx" ON "seller_orders"("sellerId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "seller_orders_platform_externalId_key" ON "seller_orders"("platform", "externalId");

-- CreateIndex
CREATE INDEX "seller_returns_sellerId_status_idx" ON "seller_returns"("sellerId", "status");

-- CreateIndex
CREATE INDEX "seller_settlements_sellerId_status_idx" ON "seller_settlements"("sellerId", "status");

-- AddForeignKey
ALTER TABLE "boss_approvals" ADD CONSTRAINT "boss_approvals_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "boss_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_tool_calls" ADD CONSTRAINT "boss_tool_calls_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "boss_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_decisions" ADD CONSTRAINT "boss_decisions_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "boss_commands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_lessons" ADD CONSTRAINT "boss_lessons_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "boss_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_lessons" ADD CONSTRAINT "boss_lessons_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "boss_commands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_lessons" ADD CONSTRAINT "boss_lessons_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "boss_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_permissions" ADD CONSTRAINT "seller_permissions_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "seller_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_listings" ADD CONSTRAINT "seller_listings_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "seller_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_listings" ADD CONSTRAINT "seller_listings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_listing_versions" ADD CONSTRAINT "seller_listing_versions_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "seller_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_inventories" ADD CONSTRAINT "seller_inventories_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "seller_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_inventories" ADD CONSTRAINT "seller_inventories_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_orders" ADD CONSTRAINT "seller_orders_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "seller_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_order_items" ADD CONSTRAINT "seller_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "seller_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_returns" ADD CONSTRAINT "seller_returns_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "seller_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_settlements" ADD CONSTRAINT "seller_settlements_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "seller_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

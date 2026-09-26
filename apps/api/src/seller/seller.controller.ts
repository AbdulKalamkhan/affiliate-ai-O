import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";

import { MarketplaceRegistryService } from "./marketplace/marketplace-registry.service";
import { SellerService } from "./seller.service";

@Controller("seller")
export class SellerController {
  constructor(
    private readonly service: SellerService,
    private readonly marketplaces: MarketplaceRegistryService,
  ) {}

  @Get("overview")
  overview() {
    return this.service.overview();
  }

  // ------------------------------------------------------------- products

  @Get("products")
  listProducts() {
    return this.service.listProducts();
  }

  @Post("products")
  createProduct(
    @Body()
    body: {
      sku?: string;
      title: string;
      description?: string;
      brand?: string;
      category?: string;
      costPrice?: number;
    },
  ) {
    return this.service.createProduct(body);
  }

  @Get("products/:id")
  getProduct(@Param("id") id: string) {
    return this.service.getProduct(id);
  }

  // ------------------------------------------------------------- listings

  @Get("listings")
  listListings(@Query("sellerId") sellerId?: string) {
    return this.service.listListings(sellerId);
  }

  @Post("listings/draft")
  createDraft(
    @Body()
    body: {
      sellerId: string;
      productId?: string;
      platform: "AMAZON_SELLER" | "FLIPKART_SELLER" | "MEESHO_SUPPLIER";
      title: string;
      description?: string;
      bullets?: string[];
      attributes?: Record<string, string>;
      price?: number;
      keywords?: string[];
    },
  ) {
    return this.service.createListingDraft(body);
  }

  @Post("listings/:id/status")
  setListingStatus(@Param("id") id: string, @Body() body: { status: string }) {
    return this.service.updateListingStatus(id, body.status);
  }

  // ----------------------------------------------------------- inventory

  @Get("inventory")
  listInventory(@Query("sellerId") sellerId?: string) {
    return this.service.listInventory(sellerId);
  }

  @Post("inventory/adjust")
  adjustInventory(
    @Body()
    body: {
      sellerId: string;
      sku: string;
      productId?: string;
      available?: number;
      reserved?: number;
      sold?: number;
      reason: string;
    },
  ) {
    return this.service.adjustInventory(body);
  }

  // --------------------------------------------------------------- orders

  @Get("orders")
  listOrders(@Query("sellerId") sellerId?: string) {
    return this.service.listOrders(sellerId);
  }

  @Post("orders")
  ingestOrder(
    @Body()
    body: {
      sellerId: string;
      platform: "AMAZON_SELLER" | "FLIPKART_SELLER" | "MEESHO_SUPPLIER";
      externalId: string;
      status?: string;
      totalAmount: number;
      items?: { sku?: string; title: string; quantity: number; unitPrice: number }[];
    },
  ) {
    return this.service.ingestOrder(body);
  }

  // -------------------------------------------------------------- returns

  @Get("returns")
  listReturns(@Query("sellerId") sellerId?: string) {
    return this.service.listReturns(sellerId);
  }

  @Post("returns")
  recordReturn(
    @Body()
    body: {
      sellerId: string;
      platform: "AMAZON_SELLER" | "FLIPKART_SELLER" | "MEESHO_SUPPLIER";
      amount: number;
      externalId?: string;
      orderId?: string;
      reason?: string;
      status?: string;
    },
  ) {
    return this.service.recordReturn(body);
  }

  // ---------------------------------------------------------- settlement

  @Get("settlements")
  listSettlements(@Query("sellerId") sellerId?: string) {
    return this.service.listSettlements(sellerId);
  }

  @Post("settlements")
  recordSettlement(
    @Body()
    body: {
      sellerId: string;
      platform: "AMAZON_SELLER" | "FLIPKART_SELLER" | "MEESHO_SUPPLIER";
      totalAmount: number;
      externalId?: string;
      fees?: number;
      refunds?: number;
      cogs?: number;
      shipping?: number;
      otherCosts?: number;
      status?: string;
    },
  ) {
    return this.service.recordSettlement(body);
  }

  // -------------------------------------------------------------- sellers

  @Get("accounts")
  listSellers() {
    return this.service.listSellers();
  }

  @Post("accounts")
  createSeller(
    @Body()
    body: { platform: "AMAZON_SELLER" | "FLIPKART_SELLER" | "MEESHO_SUPPLIER"; displayName: string },
  ) {
    return this.service.createSeller(body);
  }

  @Get("permissions")
  listPermissions(@Query("sellerId") sellerId?: string) {
    return this.service.listPermissions(sellerId);
  }

  @Post("permissions")
  setPermissions(
    @Body() body: { sellerId: string; permissions: { permission: string; granted: boolean }[] },
  ) {
    return this.service.setPermissions(body.sellerId, body.permissions);
  }

  // --------------------------------------------------------- marketplaces

  @Get("marketplaces")
  async marketplaceStatus() {
    return {
      marketplaces: await this.marketplaces.status(),
      note: "connected=true requires a VERIFIED live provider connection; credentialsPresent=true only means every required credential env var NAME is set.",
    };
  }

  @Post("marketplaces/:marketplace/sync")
  sync(
    @Param("marketplace") marketplace: string,
    @Body() body: { capability?: string },
  ) {
    const capability = (body?.capability ?? "syncCatalog") as "syncCatalog";
    return this.marketplaces
      .execute(marketplace as never, capability, (adapter) =>
        adapter.syncCatalog((body as { skus?: string[] }).skus ?? []),
      )
      .catch((error: unknown) => ({
        synced: 0,
        status: "not_connected",
        error: error instanceof Error ? error.message : "unknown error",
      }));
  }
}

import { Body, Controller, Get, HttpException, Param, Post, Query } from "@nestjs/common";

import { MarketplaceRegistryService } from "./marketplace/marketplace-registry.service";
import { SellerService } from "./seller.service";
import { MarketplaceError, type Marketplace } from "./marketplace/marketplace-adapter";
import { CurrentPrincipal, type Principal } from "../security/principal";

/**
 * Map a normalized adapter failure to an honest HTTP status.
 *
 * A missing credential and an unverified credential are different problems, so
 * they get different statuses: 428 Precondition Required means "configure it",
 * 409 Conflict means "you have it configured but it has never been proven".
 * Neither is a 200, and neither leaks a credential value.
 */
function marketplaceErrorStatus(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof MarketplaceError) {
    const status =
      error.code === "NOT_CONNECTED" ? 428 : error.code === "NOT_VERIFIED" ? 409 : 502;
    return { status, code: error.code, message: error.message };
  }
  return {
    status: 500,
    code: "PROVIDER_ERROR",
    message: error instanceof Error ? error.message : "unknown error",
  };
}

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
    @CurrentPrincipal() principal: Principal,
  ) {
    // `actor` comes from the authenticated principal; a body value cannot name
    // someone else in the money-write audit row.
    return this.service.ingestOrder({ ...body, actor: principal.id });
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
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.service.recordReturn({ ...body, actor: principal.id });
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
      externalId: string;
      fees?: number;
      refunds?: number;
      cogs?: number;
      shipping?: number;
      otherCosts?: number;
      status?: string;
    },
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.service.recordSettlement({ ...body, actor: principal.id });
  }

  /** Durable per-component cost breakdown, so net profit can be re-derived. */
  @Get("settlements/:id/lines")
  settlementLines(@Param("id") id: string) {
    return this.service.settlementLines(id);
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
  async sync(
    @Param("marketplace") marketplace: string,
    @Body() body: { skus?: string[] },
  ) {
    // A failure here is a real failure, so it propagates as a non-2xx with the
    // adapter's normalized code. Swallowing it into `{ synced: 0, status:
    // "not_connected" }` with HTTP 200 reported a successful request that synced
    // nothing, and invented a third status vocabulary that matched neither
    // ConnectionState nor AdapterErrorCode.
    try {
      const result = await this.marketplaces.execute(
        marketplace as Marketplace,
        "syncCatalog",
        (adapter) => adapter.syncCatalog(body?.skus ?? []),
      );
      return { marketplace, capability: "syncCatalog", ...result };
    } catch (error) {
      const mapped = marketplaceErrorStatus(error);
      throw new HttpException(mapped, mapped.status);
    }
  }
}

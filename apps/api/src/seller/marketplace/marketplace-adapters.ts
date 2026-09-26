// Marketplace adapters for the three target seller platforms.
//
// All three are STRUCTURALLY IMPLEMENTED and NOT CONNECTED: the capability
// surface, credential requirements and error normalization exist, but no live
// HTTP call is made because no verified credentials exist. Calling any capability
// throws MarketplaceError("NOT_CONNECTED") — it never returns fake data.

import {
  NotConnectedMarketplaceAdapter,
  type MarketplaceCapability,
  type Marketplace,
} from "./marketplace-adapter";

/** Amazon SP-API (Seller Central). */
export class AmazonSellerAdapter extends NotConnectedMarketplaceAdapter {
  readonly marketplace: Marketplace = "AMAZON_SELLER";
  readonly displayName = "Amazon Seller Central";
  readonly capabilities: readonly MarketplaceCapability[] = [
    "createListing",
    "updateListing",
    "getListing",
    "updatePrice",
    "updateInventory",
    "getOrders",
    "getOrder",
    "getReturns",
    "getSettlements",
    "getFees",
    "syncCatalog",
  ];
  readonly requiredEnvNames: readonly string[] = [
    "AMAZON_SELLER_REFRESH_TOKEN",
    "AMAZON_SELLER_LWA_CLIENT_ID",
    "AMAZON_SELLER_LWA_CLIENT_SECRET",
    "AMAZON_SELLER_MARKETPLACE_ID",
  ];
}

/** Flipkart Seller Hub. */
export class FlipkartSellerAdapter extends NotConnectedMarketplaceAdapter {
  readonly marketplace: Marketplace = "FLIPKART_SELLER";
  readonly displayName = "Flipkart Seller Hub";
  readonly capabilities: readonly MarketplaceCapability[] = [
    "createListing",
    "updateListing",
    "getListing",
    "updatePrice",
    "updateInventory",
    "getOrders",
    "getOrder",
    "getReturns",
    "getSettlements",
    "syncCatalog",
  ];
  readonly requiredEnvNames: readonly string[] = [
    "FLIPKART_SELLER_API_KEY",
    "FLIPKART_SELLER_TOKEN_URL",
    "FLIPKART_SELLER_BASE_URL",
  ];
}

/** Meesho Supplier Panel. */
export class MeeshoSupplierAdapter extends NotConnectedMarketplaceAdapter {
  readonly marketplace: Marketplace = "MEESHO_SUPPLIER";
  readonly displayName = "Meesho Supplier Panel";
  readonly capabilities: readonly MarketplaceCapability[] = [
    "createListing",
    "updateListing",
    "getListing",
    "updatePrice",
    "updateInventory",
    "getOrders",
    "getOrder",
    "getReturns",
  ];
  readonly requiredEnvNames: readonly string[] = ["MEESHO_SUPPLIER_TOKEN", "MEESHO_SUPPLIER_BASE_URL"];
}

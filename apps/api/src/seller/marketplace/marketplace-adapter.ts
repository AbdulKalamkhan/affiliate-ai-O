// Provider-neutral marketplace adapter contract.
//
// HONESTY CONTRACT: an adapter declares which capabilities it SUPPORTS. It can
// never claim a capability is "live" — connectivity is a separate, credential-
// derived fact reported by the registry. Until real credentials exist, every
// adapter reports `not_connected` and every operation fails loudly with a
// NOT_CONNECTED error instead of returning fabricated marketplace data.

export const MARKETPLACES = ["AMAZON_SELLER", "FLIPKART_SELLER", "MEESHO_SUPPLIER"] as const;
export type Marketplace = (typeof MARKETPLACES)[number];

export const MARKETPLACE_CAPABILITIES = [
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
] as const;
export type MarketplaceCapability = (typeof MARKETPLACE_CAPABILITIES)[number];

export const CONNECTION_STATES = ["not_connected", "ready_for_connection", "connected", "error"] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

/** Normalized error taxonomy so callers never depend on a provider's shape. */
export type AdapterErrorCode =
  | "NOT_CONNECTED"
  | "UNSUPPORTED_CAPABILITY"
  | "INVALID_INPUT"
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "TIMEOUT";

export class MarketplaceError extends Error {
  constructor(
    readonly code: AdapterErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "MarketplaceError";
  }
}

export interface ListingPayload {
  externalId?: string;
  title: string;
  description: string;
  bullets: string[];
  attributes: Record<string, string>;
  price: number;
  currency: string;
  sku?: string;
}

export interface OrderPayload {
  externalId: string;
  status: string;
  totalAmount: number;
  currency: string;
  items: { sku?: string; title: string; quantity: number; unitPrice: number }[];
}

export interface SettlementPayload {
  externalId: string;
  totalAmount: number;
  fees?: number;
  refunds?: number;
  currency: string;
  periodStart?: Date;
  periodEnd?: Date;
}

export interface MarketplaceAdapter {
  readonly marketplace: Marketplace;
  readonly displayName: string;
  /** Capabilities this provider can technically perform. */
  readonly capabilities: readonly MarketplaceCapability[];
  /** env var NAMES required for a live connection. Values are never stored. */
  readonly requiredEnvNames: readonly string[];
  /** True only when every required env var name is present in the process env. */
  isConfigured(): boolean;
  createListing(input: ListingPayload): Promise<{ externalId: string }>;
  updateListing(externalId: string, input: ListingPayload): Promise<void>;
  getListing(externalId: string): Promise<ListingPayload>;
  updatePrice(externalId: string, price: number, currency?: string): Promise<void>;
  updateInventory(sku: string, available: number): Promise<void>;
  getOrders(since?: Date): Promise<OrderPayload[]>;
  getOrder(externalId: string): Promise<OrderPayload>;
  getReturns(since?: Date): Promise<{ externalId: string; amount: number; status: string }[]>;
  getSettlements(since?: Date): Promise<SettlementPayload[]>;
  getFees(since?: Date): Promise<{ externalId: string; amount: number; type: string }[]>;
  syncCatalog(skus: string[]): Promise<{ synced: number }>;
}

export const supports = (adapter: MarketplaceAdapter, capability: MarketplaceCapability): boolean =>
  adapter.capabilities.includes(capability);

/**
 * Base class for adapters that are structurally implemented but not connected.
 * Every capability method fails with NOT_CONNECTED — never a fake success.
 */
export abstract class NotConnectedMarketplaceAdapter implements MarketplaceAdapter {
  abstract readonly marketplace: Marketplace;
  abstract readonly displayName: string;
  abstract readonly capabilities: readonly MarketplaceCapability[];
  abstract readonly requiredEnvNames: readonly string[];

  isConfigured(): boolean {
    return this.requiredEnvNames.every((name) => name in process.env);
  }

  protected unavailable(capability: string): MarketplaceError {
    return new MarketplaceError(
      "NOT_CONNECTED",
      `${this.displayName} is not connected: ${capability} requires live ${this.marketplace} credentials (${this.requiredEnvNames.join(", ") || "none configured"})`,
      false,
    );
  }

  async createListing(): Promise<{ externalId: string }> {
    throw this.unavailable("createListing");
  }
  async updateListing(): Promise<void> {
    throw this.unavailable("updateListing");
  }
  async getListing(): Promise<ListingPayload> {
    throw this.unavailable("getListing");
  }
  async updatePrice(): Promise<void> {
    throw this.unavailable("updatePrice");
  }
  async updateInventory(): Promise<void> {
    throw this.unavailable("updateInventory");
  }
  async getOrders(): Promise<OrderPayload[]> {
    throw this.unavailable("getOrders");
  }
  async getOrder(): Promise<OrderPayload> {
    throw this.unavailable("getOrder");
  }
  async getReturns(): Promise<{ externalId: string; amount: number; status: string }[]> {
    throw this.unavailable("getReturns");
  }
  async getSettlements(): Promise<SettlementPayload[]> {
    throw this.unavailable("getSettlements");
  }
  async getFees(): Promise<{ externalId: string; amount: number; type: string }[]> {
    throw this.unavailable("getFees");
  }
  async syncCatalog(): Promise<{ synced: number }> {
    throw this.unavailable("syncCatalog");
  }
}

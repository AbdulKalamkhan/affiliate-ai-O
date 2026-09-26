import { Injectable } from "@nestjs/common";

import {
  MarketplaceError,
  supports,
  type ConnectionState,
  type Marketplace,
  type MarketplaceAdapter,
  type MarketplaceCapability,
} from "./marketplace-adapter";
import { AmazonSellerAdapter, FlipkartSellerAdapter, MeeshoSupplierAdapter } from "./marketplace-adapters";

export interface MarketplaceStatus {
  marketplace: Marketplace;
  displayName: string;
  state: ConnectionState;
  connected: boolean;
  implementation: "implemented";
  capabilities: readonly MarketplaceCapability[];
  requiredEnvNames: readonly string[];
  missingEnvNames: string[];
  ownerAction: string | null;
}

const adapters = (): MarketplaceAdapter[] => [
  new AmazonSellerAdapter(),
  new FlipkartSellerAdapter(),
  new MeeshoSupplierAdapter(),
];

@Injectable()
export class MarketplaceRegistryService {
  private readonly list: MarketplaceAdapter[] = adapters();

  all(): MarketplaceAdapter[] {
    return this.list;
  }

  get(marketplace: Marketplace): MarketplaceAdapter {
    const found = this.list.find((a) => a.marketplace === marketplace);
    if (!found) {
      throw new MarketplaceError("PROVIDER_ERROR", `unknown marketplace ${marketplace}`, false);
    }
    return found;
  }

  /**
   * Connection truth. `connected` is derived ONLY from the presence of every
   * required credential env var NAME — never from a value, never from a guess.
   */
  status(): MarketplaceStatus[] {
    return this.list.map((adapter) => {
      const missing = adapter.requiredEnvNames.filter((name) => !(name in process.env));
      const configured = adapter.isConfigured();
      const connected = configured;
      return {
        marketplace: adapter.marketplace,
        displayName: adapter.displayName,
        state: connected ? ("connected" as const) : ("ready_for_connection" as const),
        connected,
        implementation: "implemented" as const,
        capabilities: adapter.capabilities,
        requiredEnvNames: adapter.requiredEnvNames,
        missingEnvNames: missing,
        ownerAction: connected
          ? null
          : `set ${missing.join(", ")} as server env vars to enable a live connection`,
      };
    });
  }

  /**
   * Guarded execution: capability support and connectivity are checked BEFORE
   * any adapter call, so an unsupported or unconnected capability fails with a
   * precise normalized error instead of a provider-shaped exception.
   */
  async execute<T>(
    marketplace: Marketplace,
    capability: MarketplaceCapability,
    run: (adapter: MarketplaceAdapter) => Promise<T>,
  ): Promise<T> {
    const adapter = this.get(marketplace);
    if (!supports(adapter, capability)) {
      throw new MarketplaceError(
        "UNSUPPORTED_CAPABILITY",
        `${adapter.displayName} does not support ${capability}`,
        false,
      );
    }
    if (!adapter.isConfigured()) {
      throw new MarketplaceError(
        "NOT_CONNECTED",
        `${adapter.displayName} is not connected: ${capability} requires live credentials (${adapter.requiredEnvNames.join(", ")})`,
        false,
      );
    }
    try {
      return await run(adapter);
    } catch (error) {
      if (error instanceof MarketplaceError) throw error;
      throw new MarketplaceError(
        "PROVIDER_ERROR",
        `${adapter.displayName} ${capability} failed: ${error instanceof Error ? error.message : "unknown"}`,
        true,
      );
    }
  }
}

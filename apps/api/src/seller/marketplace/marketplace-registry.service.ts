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
  /** True when every credential env var NAME is present (still NOT a connection). */
  credentialsPresent: boolean;
  implementation: "implemented";
  capabilities: readonly MarketplaceCapability[];
  requiredEnvNames: readonly string[];
  missingEnvNames: string[];
  ownerAction: string | null;
  note: string | null;
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
   * Connection truth. `connected` is derived ONLY from a verified live check with
   * the provider. Credential env var NAMES being present is reported separately as
   * `credentialsPresent` — it is never treated as a connection, and no value is
   * ever read, logged or stored.
   */
  async status(): Promise<MarketplaceStatus[]> {
    return Promise.all(
      this.list.map(async (adapter) => {
        const missing = adapter.requiredEnvNames.filter((name) => !(name in process.env));
        const credentialsPresent = adapter.isConfigured();
        // A failed/unavailable live probe must never be reported as connected.
        const connected = await adapter.isLive().catch(() => false);
        // Credentials present but never proven against the live API is its own
        // state. Reporting it as merely "ready_for_connection" would understate
        // what the Owner has already done, and reporting it as "connected" would
        // overstate what has been proven.
        const state: ConnectionState = connected
          ? "connected"
          : credentialsPresent
            ? "configured_not_verified"
            : missing.length > 0
              ? "not_connected"
              : "ready_for_connection";
        return {
          marketplace: adapter.marketplace,
          displayName: adapter.displayName,
          state,
          connected,
          credentialsPresent,
          implementation: "implemented" as const,
          capabilities: adapter.capabilities,
          requiredEnvNames: adapter.requiredEnvNames,
          missingEnvNames: missing,
          ownerAction: connected
            ? null
            : missing.length > 0
              ? `set ${missing.join(", ")} as server env vars to enable a live connection`
              : `credentials present but no live ${adapter.displayName} transport is implemented yet, so the connection remains UNVERIFIED`,
          note: connected
            ? null
            : "live provider calls are not implemented; every capability fails with NOT_CONNECTED or NOT_VERIFIED and never returns fabricated data",
        };
      }),
    );
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
    // Gate on a VERIFIED live connection, not on the presence of env var names.
    // A deployment holding every credential is still not connected until the
    // live probe succeeds, and must not be reported as such.
    if (!(await adapter.isLive().catch(() => false))) {
      if (adapter.isConfigured()) {
        throw new MarketplaceError(
          "NOT_VERIFIED",
          `${adapter.displayName} has credentials configured but no verified live connection; ${capability} cannot be claimed`,
          false,
        );
      }
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

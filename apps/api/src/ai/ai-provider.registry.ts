// AI provider registry.
//
// The registry is the only place that knows which adapters EXIST. Business
// logic never references a vendor: it names a provider, and if that provider is
// not configured the call fails closed.
//
// It also answers the honest question "what AI do we actually have?" without
// ever reporting a connection it has not verified.

import { Injectable, Logger } from "@nestjs/common";

import {
  AI_PROVIDERS,
  type AiModelDescriptor,
  type AiProvider,
  type AiProviderHealth,
  type AiProviderName,
} from "./ai-types";
import { localProvider, openAiProvider } from "./providers/http-ai.provider";
import { mockProvider } from "./providers/mock-ai.provider";

export interface ProviderRegistration {
  provider: AiProvider;
  /**
   * Models this provider may serve even when its credential is absent. Used to
   * report the intended capability without claiming it works.
   */
  declaredModels?: AiModelDescriptor[];
}

@Injectable()
export class AiProviderRegistry {
  private readonly logger = new Logger(AiProviderRegistry.name);
  private readonly providers = new Map<AiProviderName, AiProvider>();

  register(provider: AiProvider): void {
    this.providers.set(provider.name, provider);
    this.logger.log(`registered AI provider adapter "${provider.name}" (${provider.health().status})`);
  }

  registerAll(providers: AiProvider[]): void {
    for (const provider of providers) this.register(provider);
  }

  names(): AiProviderName[] {
    return [...this.providers.keys()];
  }

  get(name: AiProviderName): AiProvider | null {
    return this.providers.get(name) ?? null;
  }

  /**
   * The provider that should serve AI traffic right now.
   *
   * Selection is explicit and fail-closed: an explicitly named provider is used
   * if present, otherwise the configured `default` is used, otherwise the mock
   * is used ONLY when `allowMock` is set. Without a configured provider there is
   * no default and the caller gets `NOT_CONFIGURED`.
   */
  resolve(preferred?: AiProviderName | null): { provider: AiProvider; mocked: boolean } | null {
    if (preferred) {
      const explicit = this.get(preferred);
      if (!explicit) return null;
      return { provider: explicit, mocked: explicit.name === "mock" };
    }
    const fallbackName = process.env.AI_DEFAULT_PROVIDER as AiProviderName | undefined;
    if (fallbackName && AI_PROVIDERS.includes(fallbackName)) {
      const fallback = this.get(fallbackName);
      if (fallback) return { provider: fallback, mocked: fallbackName === "mock" };
    }
    return null;
  }

  /** Every adapter's honest health report, sorted for stable output. */
  health(): AiProviderHealth[] {
    return [...this.providers.values()]
      .map((provider) => provider.health())
      .sort((a, b) => a.provider.localeCompare(b.provider));
  }

  /**
   * Provider-level summary for `/ai/status`.
   *
   * `anyConfigured` is true only when a credential is actually present. It is
   * NOT a verified connection: that requires a successful real call, which is
   * tracked separately as `lastVerifiedAt`.
   */
  status(): {
    providers: AiProviderHealth[];
    anyConfigured: boolean;
    anyVerified: boolean;
    defaultProvider: AiProviderName | null;
    note: string;
  } {
    const providers = this.health();
    const anyConfigured = providers.some((p) => p.status === "configured");
    const fallbackName = process.env.AI_DEFAULT_PROVIDER as AiProviderName | undefined;
    return {
      providers,
      anyConfigured,
      // Nothing claims a verified provider connection until a real call has
      // succeeded; there is no way to fake this from config alone.
      anyVerified: false,
      defaultProvider:
        fallbackName && providers.some((p) => p.provider === fallbackName && p.status === "configured")
          ? fallbackName
          : null,
      note: anyConfigured
        ? "a provider credential is present; the transport is implemented. A provider is only reported as verified after a real call succeeds."
        : "no AI provider credential is configured; every AI call fails closed with NOT_CONFIGURED. The mock provider is available for tests and local development only.",
    };
  }
}

/**
 * Build the default registry.
 *
 * `openai_compatible` and `local` are separate entries even though they share one
 * wire format, because a self-hosted server must never be reported as the hosted
 * vendor. The mock is registered only when `AI_ENABLE_MOCK_PROVIDER` is truthy
 * so a production boot cannot accidentally answer real traffic from a stub.
 */
export const buildDefaultRegistry = (): AiProviderRegistry => {
  const registry = new AiProviderRegistry();
  const providers: AiProvider[] = [openAiProvider(), localProvider()];
  if (isMockEnabled()) providers.push(mockProvider());
  registry.registerAll(providers);
  return registry;
};

/**
 * The mock answers deterministically and produces no real evidence, so it is
 * opt-in and always reported as `mock`, never `configured`.
 */
export const isMockEnabled = (): boolean => {
  const raw = process.env.AI_ENABLE_MOCK_PROVIDER;
  return raw === "1" || raw?.toLowerCase() === "true";
};

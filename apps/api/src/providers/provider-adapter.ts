// Provider-neutral adapter registry (Phase-03 "provider adapters" + ACC-01
// account registry + ACC-04 connection health foundations).
//
// Every integration the codebase can host is DESCRIBED here as a typed capability
// entry. `configured` is detected from the PRESENCE of documented env var NAMES
// only — values are never read, logged, or returned (ACC-02). This is the safe
// local foundation: when a real provider's credentials are supplied, its status
// flips to configured without changing any business logic, and the "second
// provider" adapter remains gated behind the Money-First MVP gate (Affiliate-07).

export type ProviderKind = "product-data" | "affiliate-network" | "automation" | "research-feed";

export interface ProviderAdapterDescriptor {
  name: string;
  kind: ProviderKind;
  description: string;
  // Documented env var NAMES that mark this adapter as configured when present.
  // Names are the CONTRACT: the same names appear (commented) in .env.example and
  // are what a future installer fills in.
  requiredEnvNames: string[];
  // Note on when/how this adapter becomes usable (gating, capability evidence).
  activation: string;
}

export const PROVIDER_ADAPTERS: readonly ProviderAdapterDescriptor[] = [
  {
    name: "product-data/manual",
    kind: "product-data",
    description: "Manual product metadata entry (Phase-00 default — no PA-API).",
    requiredEnvNames: [],
    activation: "Active now; the product-data provider boundary (ProductDataProvider) always falls back here.",
  },
  {
    name: "product-data/pa-api",
    kind: "product-data",
    description: "Amazon Product Advertising API (auto product title/image/price/offer data).",
    requiredEnvNames: ["PA_API_ACCESS_KEY", "PA_API_SECRET_KEY", "PA_API_PARTNER_TAG"],
    activation: "Amazon PA-API account requirements must be met (Associates 30-day sales threshold). No credentials configured today.",
  },
  {
    name: "affiliate-network/amazon-associates",
    kind: "affiliate-network",
    description: "Amazon Associates link generation + click tracking (tracking ID in every tagged destination).",
    requiredEnvNames: ["ASSOCIATE_TAG"],
    activation: "Configured when ASSOCIATE_TAG is present (the Phase-00 live channel).",
  },
  {
    name: "affiliate-network/second-provider",
    kind: "affiliate-network",
    description: "Second affiliate network adapter (Affiliate-07).",
    requiredEnvNames: ["SECOND_NETWORK_API_KEY"],
    activation: "EXPLICITLY gated: only after the Money-First MVP gate passes and the Owner picks a network. Not configured.",
  },
  {
    name: "automation/n8n",
    kind: "automation",
    description: "n8n workflow execution (repeatable workflows, retries, failure recovery — Phase-05).",
    requiredEnvNames: ["N8N_WEBHOOK_URL", "N8N_WEBHOOK_SECRET"],
    activation: "Needs an n8n instance + webhook credentials. Boss tool registry + permission model already define the execution boundary.",
  },
  {
    name: "research-feed/trends",
    kind: "research-feed",
    description: "External trend/research feed (Phase-02 signal ingestion through the research-feed provider boundary).",
    requiredEnvNames: ["RESEARCH_FEED_API_KEY"],
    activation: "Needs a research feed source + key. The validateResearchSignal boundary defines the ingestion contract.",
  },
] as const;

export interface ProviderStatus {
  name: string;
  kind: ProviderKind;
  configured: boolean;
  description: string;
  activation: string;
  requiredEnvNames: string[];
  status: "configured" | "not-configured";
}

const hasConfig = (descriptor: ProviderAdapterDescriptor): boolean =>
  descriptor.requiredEnvNames.every((name) => name in process.env);

export function providerStatus(descriptor: ProviderAdapterDescriptor): ProviderStatus {
  const configured = hasConfig(descriptor);
  return {
    name: descriptor.name,
    kind: descriptor.kind,
    configured,
    description: descriptor.description,
    activation: descriptor.activation,
    requiredEnvNames: [...descriptor.requiredEnvNames],
    status: configured ? "configured" : "not-configured",
  };
}

export function providerRegistryStatus(): ProviderStatus[] {
  return PROVIDER_ADAPTERS.map(providerStatus);
}
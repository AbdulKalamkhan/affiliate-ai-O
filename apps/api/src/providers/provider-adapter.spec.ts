import { providerRegistryStatus, providerStatus, PROVIDER_ADAPTERS } from "./provider-adapter";

describe("provider adapter registry", () => {
  const savedEnv: Record<string, string | undefined> = {};
  const names = ["PA_API_ACCESS_KEY", "PA_API_SECRET_KEY", "PA_API_PARTNER_TAG", "SECOND_NETWORK_API_KEY", "N8N_WEBHOOK_URL", "N8N_WEBHOOK_SECRET", "RESEARCH_FEED_API_KEY", "ASSOCIATE_TAG"];

  beforeEach(() => {
    for (const name of names) {
      savedEnv[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of names) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
  });

  it("reports manual product data + amazon-associates as the only configured adapters by default", () => {
    process.env.ASSOCIATE_TAG = "zorajewellery-21";
    const list = providerRegistryStatus();
    expect(list.find((p) => p.name === "product-data/manual")!.configured).toBe(true);
    expect(list.find((p) => p.name === "affiliate-network/amazon-associates")!.configured).toBe(true);
    expect(list.find((p) => p.name === "product-data/pa-api")!.configured).toBe(false);
    expect(list.find((p) => p.name === "affiliate-network/second-provider")!.configured).toBe(false);
    expect(list.find((p) => p.name === "automation/n8n")!.configured).toBe(false);
    expect(list.find((p) => p.name === "research-feed/trends")!.configured).toBe(false);
  });

  it("flips to configured when ALL documented env var names are present (values never read)", () => {
    process.env.PA_API_ACCESS_KEY = "x";
    process.env.PA_API_SECRET_KEY = "y";
    expect(providerStatus(PROVIDER_ADAPTERS.find((a) => a.name === "product-data/pa-api")!).configured).toBe(false);
    process.env.PA_API_PARTNER_TAG = "zorajewellery-21";
    expect(providerStatus(PROVIDER_ADAPTERS.find((a) => a.name === "product-data/pa-api")!).configured).toBe(true);
  });

  it("labels the second-provider + n8n adapters as gated/not-configured", () => {
    const second = providerStatus(PROVIDER_ADAPTERS.find((a) => a.name === "affiliate-network/second-provider")!);
    expect(second.status).toBe("not-configured");
    expect(second.activation.toLowerCase()).toContain("money-first mvp gate");
    const n8n = providerStatus(PROVIDER_ADAPTERS.find((a) => a.name === "automation/n8n")!);
    expect(n8n.status).toBe("not-configured");
  });

  it("never leaks env VALUES in the report — only names appear", () => {
    process.env.PA_API_ACCESS_KEY = "super-secret-value";
    process.env.PA_API_SECRET_KEY = "super-secret-value";
    process.env.PA_API_PARTNER_TAG = "super-secret-value";
    const list = providerRegistryStatus();
    const json = JSON.stringify(list);
    expect(json.includes("super-secret-value")).toBe(false);
    expect(list.some((p) => p.requiredEnvNames.includes("PA_API_ACCESS_KEY"))).toBe(true);
  });

  it("returns a stable, documented set of adapters", () => {
    const names = providerRegistryStatus().map((p) => p.name);
    expect(names).toContain("product-data/manual");
    expect(names).toContain("product-data/pa-api");
    expect(names).toContain("affiliate-network/amazon-associates");
    expect(names).toContain("affiliate-network/second-provider");
    expect(names).toContain("automation/n8n");
    expect(names).toContain("research-feed/trends");
  });
});
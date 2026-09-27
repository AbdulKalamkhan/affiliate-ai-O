import { buildDefaultRegistry, isMockEnabled } from "./ai-provider.registry";
import { OPENAI_COMPATIBLE_MODELS, localProvider, openAiProvider } from "./providers/http-ai.provider";

// These tests exist because of three bugs this file would have shipped with:
//   1. a factory that was never called, so the runtime registry was EMPTY
//   2. the local adapter registered under the hosted vendor's name, so a
//      self-hosted server could be reported as `openai_compatible`
//   3. prices hardcoded in source, which this codebase cannot keep true

describe("AiProviderRegistry", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    for (const key of [
      "AI_DEFAULT_PROVIDER",
      "AI_ENABLE_MOCK_PROVIDER",
      "OPENAI_API_KEY",
      "AI_LOCAL_API_KEY",
      "AI_LOCAL_MODELS",
      "AI_MODEL_PRICES_JSON",
      "AI_OPENAI_BASE_URL",
      "AI_LOCAL_BASE_URL",
    ]) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  describe("buildDefaultRegistry", () => {
    it("registers a real adapter set, not an empty registry", () => {
      const registry = buildDefaultRegistry();
      // The bug this guards: providing the class instead of calling the factory
      // left this map empty, so every call failed with "nothing registered"
      // rather than the honest "no credential configured".
      expect(registry.names()).toEqual(expect.arrayContaining(["openai_compatible", "local"]));
    });

    it("keeps the hosted vendor and the local server as DISTINCT providers", () => {
      const registry = buildDefaultRegistry();
      const openai = registry.get("openai_compatible")!;
      const local = registry.get("local")!;
      expect(openai).toBeDefined();
      expect(local).toBeDefined();
      expect(openai).not.toBe(local);
      // A local server must never be reported as the hosted vendor.
      expect(openai.name).toBe("openai_compatible");
      expect(local.name).toBe("local");
    });

    it("does not register the mock unless it is explicitly enabled", () => {
      expect(isMockEnabled()).toBe(false);
      expect(buildDefaultRegistry().names()).not.toContain("mock");
      process.env.AI_ENABLE_MOCK_PROVIDER = "true";
      expect(isMockEnabled()).toBe(true);
      expect(buildDefaultRegistry().names()).toContain("mock");
    });

    it("reports every adapter as not_configured when no credential is present", () => {
      const registry = buildDefaultRegistry();
      for (const name of registry.names()) {
        expect(registry.get(name)!.health().status).toBe("not_configured");
      }
      expect(registry.status()).toMatchObject({
        anyConfigured: false,
        anyVerified: false,
        defaultProvider: null,
      });
    });

    it("reports a configured provider without ever claiming it is verified", () => {
      process.env.OPENAI_API_KEY = "sk-present-but-unproven";
      process.env.AI_DEFAULT_PROVIDER = "openai_compatible";
      const status = buildDefaultRegistry().status();
      expect(status.anyConfigured).toBe(true);
      // Config is not a connection. Only a real successful call may set this.
      expect(status.anyVerified).toBe(false);
      expect(status.defaultProvider).toBe("openai_compatible");
    });

    it("serves the local adapter only for models the operator declares", () => {
      const bare = localProvider();
      expect(bare.models()).toHaveLength(0);
      process.env.AI_LOCAL_API_KEY = "local-key";
      process.env.AI_LOCAL_MODELS = "llama3.1:8b, qwen2.5:14b";
      const declared = localProvider();
      expect(declared.models().map((m) => m.id)).toEqual(["llama3.1:8b", "qwen2.5:14b"]);
    });
  });

  describe("cost configuration", () => {
    it("leaves price UNKNOWN until an operator configures it", () => {
      // The bug this guards: prices were hardcoded in source, so this system
      // asserted vendor pricing it had no way to keep correct.
      for (const model of OPENAI_COMPATIBLE_MODELS) {
        expect(model.inputCostPerMillionUsd).toBeNull();
        expect(model.outputCostPerMillionUsd).toBeNull();
        expect(model.contextWindowTokens).toBeNull();
        expect(model.maxOutputTokens).toBeNull();
      }
    });

    it("applies a price only when AI_MODEL_PRICES_JSON is well formed", () => {
      process.env.OPENAI_API_KEY = "sk-present";
      process.env.AI_MODEL_PRICES_JSON = JSON.stringify({
        "openai_compatible/gpt-4o-mini": { input: 0.15, output: 0.6 },
      });
      const model = openAiProvider().models().find((m) => m.id === "gpt-4o-mini")!;
      expect(model.inputCostPerMillionUsd).toBe(0.15);
      expect(model.outputCostPerMillionUsd).toBe(0.6);
      // An unpriced model in the same list stays UNKNOWN rather than copying.
      const other = openAiProvider().models().find((m) => m.id === "gpt-4o")!;
      expect(other.inputCostPerMillionUsd).toBeNull();
    });

    it("falls back to UNKNOWN when the price config is malformed", () => {
      process.env.OPENAI_API_KEY = "sk-present";
      for (const bad of ["{not json", '{"a":{"input":"free"}}', '{"a":{"input":-1,"output":1}}', '"a string"']) {
        process.env.AI_MODEL_PRICES_JSON = bad;
        for (const model of openAiProvider().models()) {
          expect(model.inputCostPerMillionUsd).toBeNull();
        }
      }
    });
  });

  describe("resolve", () => {
    beforeEach(() => {
      process.env.AI_ENABLE_MOCK_PROVIDER = "1";
    });

    it("returns null instead of guessing when nothing is selected", () => {
      const registry = buildDefaultRegistry();
      // No AI_DEFAULT_PROVIDER: an implicit "use whichever adapter happens to
      // be registered" would be a coin flip on a billable call.
      expect(registry.resolve(null)).toBeNull();
    });

    it("uses the configured default and labels the mock honestly", () => {
      const registry = buildDefaultRegistry();
      process.env.AI_DEFAULT_PROVIDER = "mock";
      expect(registry.resolve(null)).toMatchObject({ mocked: true });
      process.env.AI_DEFAULT_PROVIDER = "openai_compatible";
      expect(registry.resolve(null)).toMatchObject({ mocked: false });
    });

    it("does not substitute another provider for a named one that is absent", () => {
      const registry = buildDefaultRegistry();
      process.env.AI_DEFAULT_PROVIDER = "mock";
      expect(registry.resolve("anthropic")).toBeNull();
    });
  });
});

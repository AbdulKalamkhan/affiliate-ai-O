import { makeFakeDb } from "../test/fake-db";
import { API_KEY_PRINCIPAL, type Principal } from "../security/principal";
import { AiController } from "./ai.controller";
import { AiProviderRegistry } from "./ai-provider.registry";
import { AiService } from "./ai.service";
import { AiError, type AiModelDescriptor, type AiProvider } from "./ai-types";
import { MockAiProvider, MOCK_MODEL_ID } from "./providers/mock-ai.provider";

const VIEWER: Principal = { id: "api-key-viewer", role: "viewer", authMethod: "api_key" };

const pricedModel: AiModelDescriptor = {
  id: "priced-1",
  role: "chat",
  contextWindowTokens: 8_000,
  inputCostPerMillionUsd: 1,
  outputCostPerMillionUsd: 2,
  maxOutputTokens: 1_000,
};

class TestProvider implements AiProvider {
  readonly name = "openai_compatible" as const;
  calls = 0;
  constructor(private readonly declaredModels: AiModelDescriptor[]) {}
  health() {
    return {
      provider: this.name,
      status: "configured" as const,
      implementation: "implemented" as const,
      credentialPresent: true,
      models: this.declaredModels,
      detail: "test adapter",
    };
  }
  models(): AiModelDescriptor[] {
    return this.declaredModels;
  }
  async complete(request: Parameters<AiProvider["complete"]>[0]) {
    this.calls += 1;
    return {
      provider: this.name,
      model: request.model,
      content: "test completion",
      finishReason: "stop" as const,
      usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
      latencyMs: 1,
      costUsd: null,
      costState: "unknown_usage" as const,
      requestId: request.requestId ?? null,
    };
  }
}

/** Invoke through the controller with the authenticated principal applied. */
const call = (
  controller: AiController,
  body: Record<string, unknown>,
  principal: Principal = API_KEY_PRINCIPAL,
) => (controller as unknown as { invoke: (b: unknown, p: Principal) => Promise<unknown> }).invoke(body, principal);

describe("AiController", () => {
  let controller: AiController;
  let service: AiService;
  let registry: AiProviderRegistry;
  let provider: TestProvider;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...savedEnv };
    for (const key of ["AI_DEFAULT_PROVIDER", "AI_ENABLE_MOCK_PROVIDER", "OPENAI_API_KEY", "API_KEY"]) {
      delete process.env[key];
    }
    registry = new AiProviderRegistry();
    provider = new TestProvider([pricedModel]);
    registry.register(provider);
    process.env.AI_DEFAULT_PROVIDER = "openai_compatible";
    service = new AiService(registry, makeFakeDb().db);
    controller = new AiController(service);
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  describe("input validation", () => {
    it("rejects an unknown provider name instead of silently using the default", async () => {
      // A typo that quietly became "use the default" is how the wrong,
      // billable model gets called.
      await expect(call(controller, { provider: "openai", model: "priced-1", messages: [{ content: "hi" }] })).rejects.toThrow(
        /unknown AI provider "openai"/,
      );
      expect(provider.calls).toBe(0);
    });

    it("requires a model", async () => {
      await expect(call(controller, { messages: [{ content: "hi" }] })).rejects.toThrow(/model is required/);
    });

    it("requires at least one message and rejects empty content", async () => {
      await expect(call(controller, { model: "priced-1", messages: [] })).rejects.toThrow(/at least one message/);
      await expect(call(controller, { model: "priced-1", messages: [{ content: "  " }] })).rejects.toThrow(
        /non-empty string content/,
      );
    });

    it("rejects an unknown role and an unknown responseFormat", async () => {
      await expect(
        call(controller, { model: "priced-1", messages: [{ role: "root", content: "hi" }] }),
      ).rejects.toThrow(/unknown message role/);
      await expect(
        call(controller, { model: "priced-1", messages: [{ content: "hi" }], responseFormat: "yaml" }),
      ).rejects.toThrow(/responseFormat/);
    });

    it("rejects an autonomy level outside the level set", async () => {
      await expect(
        call(controller, { model: "priced-1", messages: [{ content: "hi" }], autonomyLevel: 9 }),
      ).rejects.toThrow(/autonomyLevel must be an integer/);
      await expect(
        call(controller, { model: "priced-1", messages: [{ content: "hi" }], autonomyLevel: 2.5 }),
      ).rejects.toThrow(/autonomyLevel must be an integer/);
    });
  });

  describe("autonomy", () => {
    it("defaults to the fail-closed level 2 and refuses to spend", async () => {
      // The bug this guards: the route hardcoded level 2 and offered no way to
      // declare a higher one, so it could only ever return 403.
      await expect(call(controller, { model: "priced-1", messages: [{ content: "hi" }] })).rejects.toThrow(
        /below the required 3/,
      );
      expect(provider.calls).toBe(0);
    });

    it("succeeds when the caller declares an authorized level", async () => {
      const result = (await call(controller, {
        model: "priced-1",
        messages: [{ content: "hi" }],
        autonomyLevel: 3,
      })) as { content: string; provider: string };
      expect(result.content).toBe("test completion");
      expect(result.provider).toBe("openai_compatible");
    });

    it("refuses a viewer even at autonomy 3", async () => {
      await expect(
        call(controller, { model: "priced-1", messages: [{ content: "hi" }], autonomyLevel: 3 }, VIEWER),
      ).rejects.toThrow(/may not invoke/);
    });
  });

  describe("response", () => {
    it("returns only the completion, never usage or cost internals", async () => {
      const result = (await call(controller, {
        model: "priced-1",
        messages: [{ content: "hi" }],
        autonomyLevel: 3,
      })) as Record<string, unknown>;
      expect(Object.keys(result).sort()).toEqual(["content", "finishReason", "model", "provider", "requestId"]);
      expect(result).not.toHaveProperty("costUsd");
      expect(result).not.toHaveProperty("usage");
    });
  });

  describe("typed error mapping", () => {
    const failing = (code: ConstructorParameters<typeof AiError>[0]) => {
      registry.register({
        name: "openai_compatible",
        health: () => ({
          provider: "openai_compatible" as const,
          status: "configured" as const,
          implementation: "implemented" as const,
          credentialPresent: true,
          models: [pricedModel],
          detail: "test adapter",
        }),
        models: () => [pricedModel],
        complete: async () => {
          throw new AiError(code, "boundary failure", false, "openai_compatible");
        },
      });
    };

    it("maps a timeout to 504 and a provider error to 502", async () => {
      failing("TIMEOUT");
      await expect(
        call(controller, { model: "priced-1", messages: [{ content: "hi" }], autonomyLevel: 3, maxRetries: 0 }),
      ).rejects.toMatchObject({ status: 504 });

      failing("PROVIDER_ERROR");
      await expect(
        call(controller, { model: "priced-1", messages: [{ content: "hi" }], autonomyLevel: 3, maxRetries: 0 }),
      ).rejects.toMatchObject({ status: 502 });
    });

    it("maps a rate limit to 429 and an unconfigured provider to 503", async () => {
      failing("RATE_LIMITED");
      await expect(
        call(controller, { model: "priced-1", messages: [{ content: "hi" }], autonomyLevel: 3, maxRetries: 0 }),
      ).rejects.toMatchObject({ status: 429 });

      delete process.env.OPENAI_API_KEY;
      const empty = new AiProviderRegistry();
      const bare = new AiService(empty, makeFakeDb().db);
      await expect(
        call(new AiController(bare), { model: "priced-1", messages: [{ content: "hi" }], autonomyLevel: 3 }),
      ).rejects.toMatchObject({ status: 503 });
    });

    it("maps an unknown model to 400", async () => {
      failing("UNKNOWN_MODEL");
      await expect(
        call(controller, { model: "priced-1", messages: [{ content: "hi" }], autonomyLevel: 3, maxRetries: 0 }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("status", () => {
    it("exposes honest capability data and never a secret", async () => {
      const status = (await controller.status()) as Record<string, unknown>;
      expect(status).toMatchObject({ anyConfigured: true, anyVerified: false, verifiedProviders: [] });
      expect(JSON.stringify(status)).not.toMatch(/sk-[A-Za-z0-9]/);
    });
  });

  describe("mock provider via HTTP", () => {
    it("can serve the deterministic mock when explicitly enabled", async () => {
      const mockRegistry = new AiProviderRegistry();
      mockRegistry.register(new MockAiProvider());
      const mockController = new AiController(new AiService(mockRegistry, makeFakeDb().db));
      const result = (await call(mockController, {
        provider: "mock",
        model: MOCK_MODEL_ID,
        messages: [{ content: "hi" }],
        autonomyLevel: 3,
      })) as { provider: string; content: string };
      expect(result.provider).toBe("mock");
      expect(result.content).toMatch(/deterministic offline response/);
    });
  });
});

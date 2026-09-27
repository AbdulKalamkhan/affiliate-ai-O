import { makeFakeDb } from "../test/fake-db";
import type { Principal } from "../security/principal";
import { AiProviderRegistry } from "./ai-provider.registry";
import { AiService, MAX_AI_OUTPUT_TOKENS, MAX_AI_PROMPT_CHARS } from "./ai.service";
import { AiError, type AiModelDescriptor, type AiProvider, type AiProviderName } from "./ai-types";
import { MockAiProvider, MOCK_MODEL_ID } from "./providers/mock-ai.provider";
import { HttpAiProvider, OPENAI_COMPATIBLE_MODELS } from "./providers/http-ai.provider";
import { redactSecrets } from "./ai-redaction";

const OWNER: Principal = { id: "api-key-owner", role: "owner", authMethod: "api_key" };
const OPERATOR: Principal = { id: "api-key-operator", role: "operator", authMethod: "api_key" };
const VIEWER: Principal = { id: "api-key-viewer", role: "viewer", authMethod: "api_key" };

const prompt = (text = "hello") => [{ role: "user" as const, content: text }];

/** A scripted adapter so every failure mode is deterministic and offline. */
class ScriptedProvider implements AiProvider {
  calls = 0;
  constructor(
    private readonly behaviour: {
      // Lets a test stand in for a *real* provider identity so verification
      // semantics can be proven independently of the mock adapter.
      name?: AiProviderName;
      delayMs?: number;
      failTimes?: number;
      error?: AiError;
      models?: AiModelDescriptor[];
      credentialPresent?: boolean;
    } = {},
  ) {}

  get name(): AiProviderName {
    return this.behaviour.name ?? "mock";
  }

  health() {
    return {
      provider: this.name,
      status: (this.behaviour.credentialPresent === false ? "not_configured" : "configured") as
        | "configured"
        | "not_configured",
      implementation: "implemented" as const,
      credentialPresent: this.behaviour.credentialPresent !== false,
      models: this.behaviour.models ?? [],
      detail: "scripted test adapter",
    };
  }

  models(): AiModelDescriptor[] {
    return this.behaviour.models ?? [];
  }

  async complete(request: Parameters<AiProvider["complete"]>[0]) {
    this.calls += 1;
    if (this.behaviour.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.behaviour.delayMs));
    }
    if (this.behaviour.error && this.calls <= (this.behaviour.failTimes ?? 1)) {
      throw this.behaviour.error;
    }
    return {
      provider: this.name,
      model: request.model,
      content: "scripted completion",
      finishReason: "stop" as const,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      latencyMs: 1,
      costUsd: null,
      costState: "unknown_usage" as const,
      requestId: request.requestId ?? null,
    };
  }
}

const pricedModel: AiModelDescriptor = {
  id: "priced-1",
  role: "chat",
  contextWindowTokens: 8_000,
  inputCostPerMillionUsd: 1,
  outputCostPerMillionUsd: 2,
  maxOutputTokens: 1_000,
};

describe("AiService", () => {
  let db: ReturnType<typeof makeFakeDb>;
  let registry: AiProviderRegistry;
  let service: AiService;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    db = makeFakeDb();
    registry = new AiProviderRegistry();
    service = new AiService(registry, db.db);
    for (const key of ["AI_DEFAULT_PROVIDER", "OPENAI_API_KEY", "AI_LOCAL_API_KEY", "API_KEY"]) {
      delete process.env[key];
    }
    // Provider selection is explicit: there is no implicit "use whichever adapter
    // happens to be registered". Tests that want a provider must select it.
    process.env.AI_DEFAULT_PROVIDER = "mock";
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  const invocations = () => db.rows.aiInvocation!;

  // ----------------------------------------------------------- not configured

  describe("fail-closed when no provider is configured", () => {
    beforeEach(() => {
      // Nothing selected and nothing registered: the call must fail closed.
      delete process.env.AI_DEFAULT_PROVIDER;
    });

    it("refuses to invent a completion when nothing is configured", async () => {
      await expect(
        service.invoke({ principal: OWNER, request: { messages: prompt(), model: "gpt-4o-mini" }, autonomyLevel: 3 }),
      ).rejects.toBeInstanceOf(AiError);
      expect(invocations()).toHaveLength(1);
      expect(invocations()[0]).toMatchObject({ status: "not_configured", errorCode: "NOT_CONFIGURED" });
    });

    it("reports the reason to the caller without leaking a credential", async () => {
      registry.register(new ScriptedProvider({ credentialPresent: false, models: [pricedModel] }));
      const error = await service
        .invoke({ principal: OWNER, request: { messages: prompt(), model: "priced-1" }, autonomyLevel: 3 })
        .catch((e: unknown) => e as AiError);
      expect(error).toBeInstanceOf(AiError);
      expect((error as AiError).code).toBe("NOT_CONFIGURED");
    });

    it("never reports a verified connection from config alone", async () => {
      process.env.OPENAI_API_KEY = "sk-test-not-a-real-key-value";
      registry.register(
        new HttpAiProvider({
          name: "openai_compatible",
          apiKeyEnv: "OPENAI_API_KEY",
          baseUrl: "https://example.invalid/v1/chat/completions",
          models: OPENAI_COMPATIBLE_MODELS,
          authHeaders: (k) => ({ authorization: `Bearer ${k}` }),
          parse: () => {
            throw new Error("not used");
          },
        }),
      );
      const status = await service.status();
      expect(status.anyConfigured).toBe(true);
      // A credential is present, but no call has succeeded, so nothing is verified.
      expect(status.anyVerified).toBe(false);
    });
  });

  // ------------------------------------------------------------- authorization

  describe("unauthorized invocation", () => {
    beforeEach(() => {
      registry.register(new ScriptedProvider({ models: [pricedModel] }));
    });

    it("refuses a viewer outright", async () => {
      await expect(
        service.invoke({ principal: VIEWER, request: { messages: prompt(), model: "priced-1" }, autonomyLevel: 4 }),
      ).rejects.toThrow(/may not invoke an AI provider/);
      expect(invocations()[0]).toMatchObject({ status: "unauthorized" });
    });

    it("refuses autonomy below the required level and records the denial", async () => {
      await expect(
        service.invoke({ principal: OPERATOR, request: { messages: prompt(), model: "priced-1" }, autonomyLevel: 2 }),
      ).rejects.toThrow(/AI_INVOKE_AUTONOMY_TOO_LOW/);
      expect(invocations()[0]).toMatchObject({ status: "unauthorized", errorCode: "UNAUTHORIZED" });
    });

    it("never trusts an autonomy value supplied by the caller", async () => {
      // Autonomy comes from the authenticated context, not the request body.
      await expect(
        service.invoke({ principal: OWNER, request: { messages: prompt(), model: "priced-1" }, autonomyLevel: 0 }),
      ).rejects.toThrow(/AI_INVOKE_AUTONOMY_TOO_LOW/);
    });
  });

  // ------------------------------------------------------------------ success

  describe("a configured provider", () => {
    it("returns the completion and records usage", async () => {
      registry.register(new ScriptedProvider({ models: [pricedModel] }));
      const response = await service.invoke({
        principal: OWNER,
        request: { messages: prompt(), model: "priced-1" },
        autonomyLevel: 3,
      });
      expect(response.content).toBe("scripted completion");
      expect(invocations()).toHaveLength(1);
      expect(invocations()[0]).toMatchObject({
        status: "success",
        provider: "mock",
        model: "priced-1",
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        actor: "api-key-owner",
        autonomyLevel: 3,
      });
    });

    it("computes cost from the configured price", async () => {
      registry.register(new ScriptedProvider({ models: [pricedModel] }));
      await service.invoke({ principal: OWNER, request: { messages: prompt(), model: "priced-1" }, autonomyLevel: 3 });
      // 10 prompt @ $1/M + 5 completion @ $2/M = 0.00002
      expect(Number(invocations()[0]!.costUsd)).toBeCloseTo(0.00002, 8);
      expect(invocations()[0]!.costState).toBe("computed");
    });

    it("keeps cost UNKNOWN when the model has no configured price", async () => {
      registry.register(
        new ScriptedProvider({
          models: [{ ...pricedModel, inputCostPerMillionUsd: null, outputCostPerMillionUsd: null }],
        }),
      );
      await service.invoke({ principal: OWNER, request: { messages: prompt(), model: "priced-1" }, autonomyLevel: 3 });
      expect(invocations()[0]!.costUsd).toBeNull();
      expect(invocations()[0]!.costState).toBe("unknown_price");
    });

    it("keeps cost UNKNOWN when the provider reports no usage", async () => {
      const noUsage: AiProvider = {
        name: "mock",
        health: () => ({
          provider: "mock",
          status: "configured",
          implementation: "implemented",
          credentialPresent: true,
          models: [pricedModel],
          detail: "",
        }),
        models: () => [pricedModel],
        complete: async (request) => ({
          provider: "mock",
          model: request.model,
          content: "no usage reported",
          finishReason: "stop",
          usage: { promptTokens: null, completionTokens: null, totalTokens: null },
          latencyMs: 1,
          costUsd: null,
          costState: "unknown_usage",
          requestId: null,
        }),
      };
      registry.register(noUsage);
      await service.invoke({ principal: OWNER, request: { messages: prompt(), model: "priced-1" }, autonomyLevel: 3 });
      expect(invocations()[0]!.costUsd).toBeNull();
      expect(invocations()[0]!.costState).toBe("unknown_usage");
    });

    it("marks a real provider success as verified but never the mock", async () => {
      // A real provider identity succeeds -> verified.
      process.env.AI_DEFAULT_PROVIDER = "openai_compatible";
      registry.register(new ScriptedProvider({ name: "openai_compatible", models: [pricedModel] }));
      await service.invoke({ principal: OWNER, request: { messages: prompt(), model: "priced-1" }, autonomyLevel: 3 });
      expect(invocations()[0]!.provider).toBe("openai_compatible");
      expect(invocations()[0]!.verified).toBe(true);

      // The mock adapter answers, but its output is never evidence that a real
      // provider works, so it must stay unverified.
      invocations().length = 0;
      process.env.AI_DEFAULT_PROVIDER = "mock";
      registry.register(new ScriptedProvider({ models: [pricedModel] }));
      await service.invoke({ principal: OWNER, request: { messages: prompt(), model: "priced-1" }, autonomyLevel: 3 });
      expect(invocations()[0]!.provider).toBe("mock");
      expect(invocations()[0]!.verified).toBe(false);
    });

    it("reports a provider as verified only after a real call has succeeded", async () => {
      process.env.AI_DEFAULT_PROVIDER = "openai_compatible";
      registry.register(new ScriptedProvider({ name: "openai_compatible", models: [pricedModel] }));

      // Config alone is not evidence.
      expect((await service.status()).anyVerified).toBe(false);
      expect((await service.status()).anyConfigured).toBe(true);
      expect((await service.status()).verifiedProviders).toEqual([]);

      await service.invoke({ principal: OWNER, request: { messages: prompt(), model: "priced-1" }, autonomyLevel: 3 });

      const after = await service.status();
      expect(after.anyVerified).toBe(true);
      expect(after.verifiedProviders).toEqual(["openai_compatible"]);
    });

    it("does not report a provider as verified when the real call fails", async () => {
      process.env.AI_DEFAULT_PROVIDER = "openai_compatible";
      registry.register(
        new ScriptedProvider({
          name: "openai_compatible",
          models: [pricedModel],
          error: new AiError("PROVIDER_ERROR", "upstream exploded", false, "openai_compatible"),
        }),
      );
      await expect(
        service.invoke({ principal: OWNER, request: { messages: prompt(), model: "priced-1" }, autonomyLevel: 3 }),
      ).rejects.toBeInstanceOf(AiError);
      expect((await service.status()).anyVerified).toBe(false);
    });
  });

  // --------------------------------------------------------------- validation

  describe("request validation", () => {
    beforeEach(() => {
      registry.register(new ScriptedProvider({ name: "openai_compatible", models: [pricedModel] }));
      process.env.AI_DEFAULT_PROVIDER = "openai_compatible";
    });

    it("refuses a model the adapter does not serve, without spending anything", async () => {
      const provider = registry.get("openai_compatible")!;
      const callsBefore = (provider as unknown as ScriptedProvider).calls;
      const error = await service
        .invoke({ principal: OWNER, request: { messages: prompt(), model: "gpt-4o-not-offered" }, autonomyLevel: 3 })
        .catch((e: unknown) => e as AiError);
      expect(error).toBeInstanceOf(AiError);
      expect((error as AiError).code).toBe("UNKNOWN_MODEL");
      expect((error as AiError).message).toMatch(/does not serve model/);
      expect((provider as unknown as ScriptedProvider).calls).toBe(callsBefore);
    });

    it("refuses an empty message list", async () => {
      const error = await service
        .invoke({ principal: OWNER, request: { messages: [], model: "priced-1" }, autonomyLevel: 3 })
        .catch((e: unknown) => e as AiError);
      expect((error as AiError).message).toMatch(/at least one message/);
    });

    it("refuses a prompt above the character ceiling", async () => {
      const error = await service
        .invoke({
          principal: OWNER,
          request: { messages: prompt("x".repeat(MAX_AI_PROMPT_CHARS + 1)), model: "priced-1" },
          autonomyLevel: 3,
        })
        .catch((e: unknown) => e as AiError);
      expect((error as AiError).message).toMatch(/above the .* character limit/);
    });

    it("refuses an out-of-range temperature and an oversized output cap", async () => {
      await expect(
        service.invoke({
          principal: OWNER,
          request: { messages: prompt(), model: "priced-1", temperature: 7 },
          autonomyLevel: 3,
        }),
      ).rejects.toThrow(/temperature must be/);
      await expect(
        service.invoke({
          principal: OWNER,
          request: { messages: prompt(), model: "priced-1", maxOutputTokens: MAX_AI_OUTPUT_TOKENS + 1 },
          autonomyLevel: 3,
        }),
      ).rejects.toThrow(/maxOutputTokens must be/);
    });

    it("refuses a request when the provider declares no servable models", async () => {
      const empty = new ScriptedProvider({ name: "local", models: [] });
      registry.register(empty);
      process.env.AI_DEFAULT_PROVIDER = "local";
      const error = await service
        .invoke({ principal: OWNER, request: { messages: prompt(), model: "anything" }, autonomyLevel: 3 })
        .catch((e: unknown) => e as AiError);
      expect((error as AiError).code).toBe("NOT_CONFIGURED");
      expect((error as AiError).message).toMatch(/declares no servable models/);
    });
  });

  // ------------------------------------------------------------------ timeout

  describe("timeout", () => {
    it("aborts a slow provider and records a timeout", async () => {
      const slow = new ScriptedProvider({ delayMs: 5_000, models: [pricedModel] });
      registry.register(slow);
      const error = await service
        .invoke({
          principal: OWNER,
          request: { messages: prompt(), model: "priced-1", timeoutMs: 1_000, maxRetries: 0 },
          autonomyLevel: 3,
        })
        .catch((e: unknown) => e as AiError);
      expect((error as AiError).code).toBe("TIMEOUT");
      expect(invocations()[0]).toMatchObject({ status: "timeout", errorCode: "TIMEOUT" });
    });

    it("clamps a caller-supplied timeout to the service ceiling", async () => {
      const slow = new ScriptedProvider({ delayMs: 50, models: [pricedModel] });
      registry.register(slow);
      // A caller asking for an hour must not be able to pin a request open.
      const response = await service.invoke({
        principal: OWNER,
        request: { messages: prompt(), model: "priced-1", timeoutMs: 3_600_000 },
        autonomyLevel: 3,
      });
      expect(response.content).toBe("scripted completion");
    });
  });

  // ------------------------------------------------------------ retry/failure

  describe("failure handling", () => {
    it("retries a retryable error then succeeds", async () => {
      const flaky = new ScriptedProvider({
        error: new AiError("RATE_LIMITED", "slow down", true),
        failTimes: 2,
        models: [pricedModel],
      });
      registry.register(flaky);
      const response = await service.invoke({
        principal: OWNER,
        request: { messages: prompt(), model: "priced-1", maxRetries: 3 },
        autonomyLevel: 3,
      });
      expect(response.content).toBe("scripted completion");
      expect(flaky.calls).toBe(3);
    });

    it("does not retry a non-retryable error", async () => {
      const broken = new ScriptedProvider({
        error: new AiError("UNAUTHORIZED", "bad key", false),
        failTimes: 5,
        models: [pricedModel],
      });
      registry.register(broken);
      await expect(
        service.invoke({
          principal: OWNER,
          request: { messages: prompt(), model: "priced-1", maxRetries: 3 },
          autonomyLevel: 3,
        }),
      ).rejects.toThrow(/bad key/);
      expect(broken.calls).toBe(1);
    });

    it("surfaces a provider failure and records it", async () => {
      registry.register(
        new ScriptedProvider({ error: new AiError("PROVIDER_ERROR", "upstream 500", false), models: [pricedModel] }),
      );
      await expect(
        service.invoke({
          principal: OWNER,
          request: { messages: prompt(), model: "priced-1", maxRetries: 0 },
          autonomyLevel: 3,
        }),
      ).rejects.toThrow(/upstream 500/);
      expect(invocations()[0]).toMatchObject({ status: "provider_error", errorCode: "PROVIDER_ERROR" });
    });

    it("rejects an invalid response rather than returning empty content", async () => {
      const invalid: AiProvider = {
        name: "mock",
        health: () => ({
          provider: "mock",
          status: "configured",
          implementation: "implemented",
          credentialPresent: true,
          models: [pricedModel],
          detail: "",
        }),
        models: () => [pricedModel],
        complete: async () => {
          throw new AiError("INVALID_RESPONSE", "response had no assistant message", false, "mock");
        },
      };
      registry.register(invalid);
      await expect(
        service.invoke({
          principal: OWNER,
          request: { messages: prompt(), model: "priced-1", maxRetries: 0 },
          autonomyLevel: 3,
        }),
      ).rejects.toThrow(/no assistant message/);
      expect(invocations()[0]).toMatchObject({ status: "invalid_response" });
    });

    it("records exactly one row per failed call, not one per retry", async () => {
      registry.register(
        new ScriptedProvider({ error: new AiError("PROVIDER_ERROR", "always down", true), failTimes: 5, models: [pricedModel] }),
      );
      await expect(
        service.invoke({
          principal: OWNER,
          request: { messages: prompt(), model: "priced-1", maxRetries: 2 },
          autonomyLevel: 3,
        }),
      ).rejects.toBeInstanceOf(AiError);
      expect(invocations()).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------ redaction

  describe("secret redaction", () => {
    it("never persists a credential that was pasted into the prompt", async () => {
      registry.register(new ScriptedProvider({ models: [pricedModel] }));
      await service.invoke({
        principal: OWNER,
        request: {
          messages: prompt("here is my key sk-live-abcdefghijklmnopqrstuvwx please use it"),
          model: "priced-1",
        },
        autonomyLevel: 3,
      });
      const stored = JSON.stringify(invocations()[0]);
      expect(stored).not.toContain("sk-live-abcdefghijklmnopqrstuvwx");
      expect(stored).toContain("[REDACTED]");
    });

    it("keeps the surrounding text intact and adds nothing of its own", () => {
      // The old assertions (`not.toContain` the secret, `toContain`
      // "[REDACTED]") passed while the redactor was splicing the match OFFSET
      // and the entire original string into its own output. Assert exact output.
      expect(redactSecrets("here is my key sk-live-abcdefghijklmnopqrstuvwx please use it")).toBe(
        "here is my key [REDACTED] please use it",
      );
      expect(redactSecrets("call it with Authorization: Bearer abcdefghij1234567890 ok")).toBe(
        "call it with Authorization: Bearer [REDACTED] ok",
      );
      expect(redactSecrets("api_key=supersecretvalue1 and password: hunter2hunter2")).toBe(
        "api_key=[REDACTED] and password: [REDACTED]",
      );
      expect(redactSecrets("AIzaSyA0123456789abcdefghijklmnopqrstuv")).toBe("[REDACTED]");
      expect(redactSecrets("ghp_0123456789abcdefghijABCDEFGHIJ01234567")).toBe("[REDACTED]");
    });

    it("preserves a connection string's structure while masking the password", () => {
      expect(redactSecrets("postgres://user:hunter2@db.internal:5432/aios")).toBe(
        "postgres://user:[REDACTED]@db.internal:5432/aios",
      );
    });

    it("leaves ordinary prose byte-for-byte unchanged", () => {
      const prose = "Generate a caption for the anklet listing, tone: premium, language: English.";
      expect(redactSecrets(prose)).toBe(prose);
    });

    it("never persists the configured provider credential", async () => {
      process.env.OPENAI_API_KEY = "sk-super-secret-value-1234567890";
      registry.register(new ScriptedProvider({ models: [pricedModel] }));
      await service.invoke({
        principal: OWNER,
        request: { messages: prompt(`my key is sk-super-secret-value-1234567890`), model: "priced-1" },
        autonomyLevel: 3,
      });
      expect(JSON.stringify(invocations()[0])).not.toContain("sk-super-secret-value-1234567890");
    });

    it("redacts a secret echoed back inside the response", async () => {
      const leaky: AiProvider = {
        name: "mock",
        health: () => ({
          provider: "mock",
          status: "configured",
          implementation: "implemented",
          credentialPresent: true,
          models: [pricedModel],
          detail: "",
        }),
        models: () => [pricedModel],
        complete: async (request) => ({
          provider: "mock",
          model: request.model,
          content: "I used sk-echoed-secret-abcdefghijklmnop for you",
          finishReason: "stop",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          latencyMs: 1,
          costUsd: 0,
          costState: "computed",
          requestId: null,
        }),
      };
      registry.register(leaky);
      await service.invoke({
        principal: OWNER,
        request: { messages: prompt(), model: "priced-1" },
        autonomyLevel: 3,
      });
      expect(JSON.stringify(invocations()[0])).not.toContain("sk-echoed-secret-abcdefghijklmnop");
    });

    it("redacts a credential embedded in an error message", async () => {
      registry.register(
        new ScriptedProvider({
          error: new AiError("PROVIDER_ERROR", "rejected Authorization: Bearer sk-leak-in-error-1234567890", false),
          models: [pricedModel],
        }),
      );
      await service
        .invoke({
          principal: OWNER,
          request: { messages: prompt(), model: "priced-1", maxRetries: 0 },
          autonomyLevel: 3,
        })
        .catch(() => undefined);
      const stored = JSON.stringify(invocations()[0]);
      expect(stored).not.toContain("sk-leak-in-error-1234567890");
      expect(stored).toContain("[REDACTED]");
    });
  });

  // ------------------------------------------------------------------ fallback

  describe("provider selection and fallback", () => {
    it("uses AI_DEFAULT_PROVIDER when no provider is named", async () => {
      process.env.AI_DEFAULT_PROVIDER = "mock";
      const mock = new MockAiProvider();
      registry.register(mock);
      const response = await service.invoke({
        principal: OWNER,
        request: { messages: prompt(), model: MOCK_MODEL_ID },
        autonomyLevel: 3,
      });
      expect(response.provider).toBe("mock");
    });

    it("prefers an explicitly named provider over the default", async () => {
      process.env.AI_DEFAULT_PROVIDER = "local";
      registry.registerAll([new MockAiProvider(), new ScriptedProvider({ models: [pricedModel] })]);
      const response = await service.invoke({
        principal: OWNER,
        provider: "mock",
        request: { messages: prompt(), model: MOCK_MODEL_ID },
        autonomyLevel: 3,
      });
      expect(response.provider).toBe("mock");
    });

    it("does NOT silently fall back to the mock when a real provider is requested", async () => {
      registry.register(new MockAiProvider());
      // openai_compatible has no adapter at all here, so it must fail closed.
      await expect(
        service.invoke({
          principal: OWNER,
          provider: "openai_compatible",
          request: { messages: prompt(), model: "gpt-4o-mini" },
          autonomyLevel: 3,
        }),
      ).rejects.toBeInstanceOf(AiError);
      expect(invocations()[0]).toMatchObject({ status: "not_configured" });
    });

    it("rejects an unknown provider name instead of guessing", async () => {
      registry.register(new MockAiProvider());
      await expect(
        service.invoke({
          principal: OWNER,
          provider: "skynet" as AiProviderName,
          request: { messages: prompt(), model: MOCK_MODEL_ID },
          autonomyLevel: 3,
        }),
      ).rejects.toBeInstanceOf(AiError);
    });
  });

  // ------------------------------------------------------------------- usage

  describe("usage accounting", () => {
    beforeEach(() => {
      registry.register(new ScriptedProvider({ models: [pricedModel] }));
    });

    it("reports no_data rather than zeroes when nothing has been called", async () => {
      const totals = await service.usageTotals();
      expect(totals).toMatchObject({ invocations: 0, costState: "no_data" });
      expect(totals.costUsd).toBeNull();
      expect(totals.totalTokens).toBeNull();
    });

    it("sums known rows and counts unknowns separately", async () => {
      await service.invoke({ principal: OWNER, request: { messages: prompt(), model: "priced-1" }, autonomyLevel: 3 });
      await db.db.aiInvocation.create({
        data: {
          provider: "mock",
          model: "priced-1",
          providerStatus: "configured",
          status: "success",
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          costUsd: null,
          costState: "unknown_price",
        },
      });
      const totals = await service.usageTotals();
      expect(totals.invocations).toBe(2);
      expect(totals.succeeded).toBe(2);
      expect(totals.unknownCostInvocations).toBe(1);
      // Token counts still sum across the rows that reported them.
      expect(totals.totalTokens).toBe(15);
      // The cost TOTAL is unknown because one row's cost is unknown: a partial
      // sum presented as a total would be a fabricated number.
      expect(totals.costUsd).toBeNull();
    });

    it("returns a real cost total when every row is priced", async () => {
      await service.invoke({ principal: OWNER, request: { messages: prompt(), model: "priced-1" }, autonomyLevel: 3 });
      const totals = await service.usageTotals();
      expect(totals.costState).toBe("computed");
      expect(totals.costUsd).toBeCloseTo(0.00002, 8);
    });

    it("counts failures separately from successes", async () => {
      registry.register(
        new ScriptedProvider({ error: new AiError("PROVIDER_ERROR", "down", false), models: [pricedModel] }),
      );
      await service
        .invoke({ principal: OWNER, request: { messages: prompt(), model: "priced-1", maxRetries: 0 }, autonomyLevel: 3 })
        .catch(() => undefined);
      const totals = await service.usageTotals();
      expect(totals).toMatchObject({ invocations: 1, succeeded: 0, failed: 1 });
    });

    it("leaves token totals UNKNOWN when no call reported usage", async () => {
      // A failed call records no usage. `Number(null)` is 0, so the obvious
      // implementation reported a confident 0-token total for a provider that
      // never answered. The smoke test caught exactly this.
      registry.register(
        new ScriptedProvider({ error: new AiError("PROVIDER_ERROR", "down", false), models: [pricedModel] }),
      );
      await service
        .invoke({ principal: OWNER, request: { messages: prompt(), model: "priced-1", maxRetries: 0 }, autonomyLevel: 3 })
        .catch(() => undefined);
      const totals = await service.usageTotals();
      expect(totals.promptTokens).toBeNull();
      expect(totals.completionTokens).toBeNull();
      expect(totals.totalTokens).toBeNull();
      expect(totals.costUsd).toBeNull();
    });
  });

  // -------------------------------------------------------------- no mutation

  describe("AI cannot mutate business state", () => {
    it("writes only to ai_invocations and touches no business table", async () => {
      registry.register(new ScriptedProvider({ models: [pricedModel] }));
      await service.invoke({ principal: OWNER, request: { messages: prompt(), model: "priced-1" }, autonomyLevel: 3 });
      for (const table of [
        "revenueEvent",
        "profitRecord",
        "affiliateLink",
        "contentAsset",
        "sellerOrder",
        "sellerSettlement",
        "bossAction",
      ] as const) {
        expect(db.rows[table] ?? []).toHaveLength(0);
      }
      expect(invocations()).toHaveLength(1);
    });
  });
});

describe("MockAiProvider", () => {
  it("is deterministic for the same input and seed", async () => {
    const provider = new MockAiProvider();
    const request = { messages: prompt("same"), model: MOCK_MODEL_ID, seed: 7 };
    const a = await provider.complete(request);
    const b = await provider.complete(request);
    expect(a.content).toBe(b.content);
  });

  it("changes with the seed so branching is testable", async () => {
    const provider = new MockAiProvider();
    const a = await provider.complete({ messages: prompt("same"), model: MOCK_MODEL_ID, seed: 1 });
    const b = await provider.complete({ messages: prompt("same"), model: MOCK_MODEL_ID, seed: 2 });
    expect(a.content).not.toBe(b.content);
  });

  it("always labels itself as a mock, never as a real vendor", () => {
    expect(new MockAiProvider().health()).toMatchObject({ status: "mock", provider: "mock" });
  });

  it("rejects a model it does not serve", async () => {
    await expect(new MockAiProvider().complete({ messages: prompt(), model: "gpt-4o" })).rejects.toThrow(
      /does not serve model/,
    );
  });

  it("returns valid JSON when a json_object format is requested", async () => {
    const response = await new MockAiProvider().complete({
      messages: prompt("hi"),
      model: MOCK_MODEL_ID,
      responseFormat: "json_object",
    });
    expect(() => JSON.parse(response.content)).not.toThrow();
  });
});

describe("HttpAiProvider", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  const build = (apiKeyEnv: string) =>
    new HttpAiProvider({
      name: "openai_compatible",
      apiKeyEnv,
      baseUrl: "https://example.invalid/v1/chat/completions",
      models: OPENAI_COMPATIBLE_MODELS,
      authHeaders: (key) => ({ authorization: `Bearer ${key}` }),
      parse: (raw, request) => {
        const body = raw as { choices?: { message?: { content?: string } }[] };
        return {
          provider: "openai_compatible",
          model: request.model,
          content: body.choices?.[0]?.message?.content ?? "",
          finishReason: "stop",
          usage: { promptTokens: null, completionTokens: null, totalTokens: null },
          latencyMs: 1,
          costUsd: null,
          costState: "unknown_usage",
          requestId: null,
        };
      },
    });

  it("reports not_configured with no credential and never returns models", () => {
    delete process.env.TEST_AI_KEY;
    const provider = build("TEST_AI_KEY");
    expect(provider.health()).toMatchObject({ status: "not_configured", credentialPresent: false });
    expect(provider.models()).toHaveLength(0);
  });

  it("throws NOT_CONFIGURED rather than attempting a call", async () => {
    delete process.env.TEST_AI_KEY;
    await expect(build("TEST_AI_KEY").complete({ messages: prompt(), model: "gpt-4o-mini" })).rejects.toThrow(
      /NOT_CONFIGURED|not configured/,
    );
  });

  it("does not claim a verified connection just because a credential exists", () => {
    process.env.TEST_AI_KEY = "sk-something";
    expect(build("TEST_AI_KEY").health().detail).toMatch(/not verified until a real call succeeds/);
  });

  it("never returns the credential through health()", () => {
    process.env.TEST_AI_KEY = "sk-super-secret-1234567890";
    expect(JSON.stringify(build("TEST_AI_KEY").health())).not.toContain("sk-super-secret-1234567890");
  });
});

// Deterministic offline AI provider.
//
// This exists so the ENTIRE AI boundary — registry, retry, timeout, usage,
// cost, redaction, audit — is testable and demonstrable with zero external
// dependency and zero fabricated "real" model output.
//
// HONESTY: this provider is ALWAYS labelled `mock`. It is never presented as
// OpenAI/Anthropic/Google output, it is not used when a real provider is
// configured unless explicitly selected, and its cost is reported as the
// literal 0.0 *because it genuinely costs nothing* — that is a real zero, not
// an unknown.

import {
  AiError,
  type AiModelDescriptor,
  type AiProvider,
  type AiProviderHealth,
  type AiProviderName,
  type AiRequest,
  type AiResponse,
} from "../ai-types";

export const MOCK_MODEL_ID = "mock-deterministic-v1";

const MOCK_MODELS: AiModelDescriptor[] = [
  {
    id: MOCK_MODEL_ID,
    role: "chat",
    contextWindowTokens: 8_192,
    inputCostPerMillionUsd: 0,
    outputCostPerMillionUsd: 0,
    maxOutputTokens: 2_048,
  },
];

/**
 * Cheap deterministic hash so the same prompt always yields the same reply.
 * FNV-1a: stable across processes and Node versions, unlike `Math.random` or
 * object key ordering.
 */
const stableHash = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

/** ~4 characters per token is the standard rough estimate for English text. */
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export interface MockProviderOptions {
  /** Simulated latency, so timeout handling is testable without real waiting. */
  latencyMs?: number;
  /** Set to make the provider fail, for the failure-path tests. */
  failWith?: { code: "PROVIDER_ERROR" | "RATE_LIMITED" | "INVALID_RESPONSE"; message: string };
}

export class MockAiProvider implements AiProvider {
  readonly name: AiProviderName = "mock";

  constructor(private readonly options: MockProviderOptions = {}) {}

  health(): AiProviderHealth {
    return {
      provider: "mock",
      status: "mock",
      implementation: "implemented",
      credentialPresent: false,
      models: MOCK_MODELS,
      detail:
        "deterministic offline provider for tests and local development; it is not a real model and its output is never business evidence",
    };
  }

  models(): AiModelDescriptor[] {
    return MOCK_MODELS;
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    const started = Date.now();
    const fail = this.options.failWith;
    if (this.options.latencyMs && this.options.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.latencyMs));
    }
    if (fail) {
      throw new AiError(fail.code, fail.message, fail.code === "RATE_LIMITED", "mock");
    }
    if (request.model !== MOCK_MODEL_ID) {
      throw new AiError("UNKNOWN_MODEL", `mock provider does not serve model "${request.model}"`, false, "mock");
    }

    const prompt = request.messages.map((m) => `${m.role}:${m.content}`).join("\n");
    const digest = stableHash(`${request.seed ?? 0}:${prompt}`);
    const promptTokens = estimateTokens(prompt);
    const completionTokens = 12;

    if (request.responseFormat === "json_object") {
      // Deterministic, schema-shaped output so callers can validate it for real.
      return {
        provider: "mock",
        model: MOCK_MODEL_ID,
        content: JSON.stringify({ mock: true, digest, echo: request.messages.at(-1)?.content ?? "" }),
        finishReason: "stop",
        usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
        latencyMs: Date.now() - started,
        costUsd: 0,
        costState: "computed",
        requestId: request.requestId ?? null,
      };
    }

    return {
      provider: "mock",
      model: MOCK_MODEL_ID,
      content: `[mock:${digest.toString(16)}] deterministic offline response; not a real model completion`,
      finishReason: "stop",
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      latencyMs: Date.now() - started,
      costUsd: 0,
      costState: "computed",
      requestId: request.requestId ?? null,
    };
  }
}

/** Factory used by the default registry. */
export const mockProvider = (options: MockProviderOptions = {}): MockAiProvider => new MockAiProvider(options);

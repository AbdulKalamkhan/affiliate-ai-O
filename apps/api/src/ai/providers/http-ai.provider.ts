// HTTP-based AI provider adapters.
//
// These adapters contain ZERO business logic. They translate the neutral
// `AiRequest` into a vendor HTTP call, translate the reply back, and map every
// failure onto a typed `AiError`. All policy (which model, which autonomy, what
// happens to the result) lives in `AiService` and above.
//
// HONESTY: with no credential present, `health()` returns
// `not_configured` and `complete()` throws `AiError("NOT_CONFIGURED")`. The
// adapters never invent a response and never fall back to the mock on their own.

import {
  AiError,
  type AiModelDescriptor,
  type AiProvider,
  type AiProviderHealth,
  type AiProviderName,
  type AiRequest,
  type AiResponse,
} from "../ai-types";

export interface HttpProviderOptions {
  name: AiProviderName;
  /** Env var holding the credential. The value is NEVER logged or returned. */
  apiKeyEnv: string;
  baseUrl: string;
  models: AiModelDescriptor[];
  /** Headers added to every request, given the already-read credential. */
  authHeaders: (apiKey: string) => Record<string, string>;
  /** Map a vendor JSON body to a neutral response. */
  parse: (body: unknown, request: AiRequest, latencyMs: number) => AiResponse;
  implementation?: "implemented" | "not_implemented";
  notImplementedDetail?: string;
  defaultTimeoutMs?: number;
  maxTimeoutMs?: number;
}

export class HttpAiProvider implements AiProvider {
  readonly name: AiProviderName;

  constructor(private readonly options: HttpProviderOptions) {
    this.name = options.name;
  }

  private credential(): string | null {
    const value = process.env[this.options.apiKeyEnv];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  }

  health(): AiProviderHealth {
    const implementation = this.options.implementation ?? "implemented";
    if (implementation === "not_implemented") {
      return {
        provider: this.name,
        status: "not_implemented",
        implementation: "not_implemented",
        credentialPresent: false,
        models: [],
        detail:
          this.options.notImplementedDetail ??
          `${this.name} transport is declared but not implemented in this codebase`,
      };
    }
    const credential = this.credential();
    return {
      provider: this.name,
      status: credential ? "configured" : "not_configured",
      implementation: "implemented",
      // Name-presence only. This is NOT a verified connection and must never be
      // reported as one.
      credentialPresent: credential !== null,
      models: credential ? this.options.models : [],
      detail: credential
        ? `credential ${this.options.apiKeyEnv} is present; transport implemented. Connection is not verified until a real call succeeds.`
        : `no credential in ${this.options.apiKeyEnv}; provider is NOT_CONFIGURED and every call fails closed`,
    };
  }

  models(): AiModelDescriptor[] {
    return this.credential() ? this.options.models : [];
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    const credential = this.credential();
    if (!credential) {
      throw new AiError(
        "NOT_CONFIGURED",
        `${this.name} is not configured: no credential in ${this.options.apiKeyEnv}`,
        false,
        this.name,
      );
    }
    const ceiling = this.options.maxTimeoutMs ?? 120_000;
    const timeoutMs = Math.min(
      Math.max(1_000, request.timeoutMs ?? this.options.defaultTimeoutMs ?? 30_000),
      ceiling,
    );

    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (typeof request.temperature === "number") body.temperature = request.temperature;
    if (typeof request.maxOutputTokens === "number") body.max_tokens = request.maxOutputTokens;
    if (request.responseFormat === "json_object") body.response_format = { type: "json_object" };
    if (typeof request.seed === "number") body.seed = request.seed;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const response = await fetch(this.options.baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json", ...this.options.authHeaders(credential) },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;

      if (response.status === 429) {
        throw new AiError("RATE_LIMITED", `${this.name} rate limited the request`, true, this.name);
      }
      if (response.status === 401 || response.status === 403) {
        // The body may echo the key back; never include it in the message.
        throw new AiError(
          "UNAUTHORIZED",
          `${this.name} rejected the credential (HTTP ${response.status})`,
          false,
          this.name,
        );
      }
      if (!response.ok) {
        throw new AiError(
          "PROVIDER_ERROR",
          `${this.name} returned HTTP ${response.status}`,
          response.status >= 500,
          this.name,
        );
      }

      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        throw new AiError("INVALID_RESPONSE", `${this.name} returned a non-JSON body`, true, this.name);
      }
      return this.options.parse(parsed, request, latencyMs);
    } catch (error) {
      if (error instanceof AiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new AiError("TIMEOUT", `${this.name} did not respond within ${timeoutMs}ms`, true, this.name);
      }
      throw new AiError(
        "PROVIDER_ERROR",
        `${this.name} transport failed: ${error instanceof Error ? error.message : "unknown error"}`,
        true,
        this.name,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

const asNumber = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/**
 * Prices are configuration, not code.
 *
 * Vendor prices change without notice, so a price baked into a source file is a
 * claim this system cannot keep true. Every model therefore starts at
 * `null` (cost UNKNOWN) and only becomes `computed` when an operator supplies a
 * price through `AI_MODEL_PRICES_JSON`, which they are expected to take from the
 * vendor's own published pricing page.
 *
 * Format: `{"<provider>/<model>": {"input": <usd per 1M prompt tokens>, "output": <usd per 1M completion tokens>}}`
 */
const readModelPrices = (): Record<string, { input: number; output: number }> => {
  const raw = process.env.AI_MODEL_PRICES_JSON;
  if (!raw || !raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<string, { input: number; output: number }> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== "object" || value === null) continue;
      const { input, output } = value as { input?: unknown; output?: unknown };
      if (typeof input !== "number" || !Number.isFinite(input)) continue;
      if (typeof output !== "number" || !Number.isFinite(output)) continue;
      if (input < 0 || output < 0) continue;
      out[key] = { input, output };
    }
    return out;
  } catch {
    // A malformed price file must not crash boot; it just leaves cost UNKNOWN,
    // which is the honest state anyway.
    return {};
  }
};

const withPrices = (provider: AiProviderName, models: AiModelDescriptor[]): AiModelDescriptor[] => {
  const prices = readModelPrices();
  return models.map((model) => {
    const configured = prices[`${provider}/${model.id}`];
    return {
      ...model,
      inputCostPerMillionUsd: configured ? configured.input : null,
      outputCostPerMillionUsd: configured ? configured.output : null,
    };
  });
};

/**
 * OpenAI-compatible chat-completions shape. Also the de-facto standard for
 * Ollama, vLLM, LM Studio, Groq and Together, so one adapter can serve a hosted
 * vendor and a self-hosted model — but they are registered under DIFFERENT
 * provider names so a local server can never masquerade as the hosted vendor.
 *
 * The model ids below are the ones this adapter is willing to send by default.
 * Context and output limits are marked UNKNOWN (`null`) rather than asserted
 * from memory; an operator can fill them in via `AI_MODEL_LIMITS_JSON`.
 */
const openAiCompatibleProvider = (
  name: AiProviderName,
  baseUrl: string,
  apiKeyEnv: string,
  models: AiModelDescriptor[],
): HttpAiProvider =>
  new HttpAiProvider({
    name,
    apiKeyEnv,
    baseUrl: `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    models: withPrices(name, models),
    authHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
    parse: (raw, request, latencyMs) => {
      const body = (raw ?? {}) as {
        choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
      };
      const choice = body.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content !== "string") {
        throw new AiError("INVALID_RESPONSE", `${name} response had no assistant message content`, false, name);
      }
      const promptTokens = asNumber(body.usage?.prompt_tokens);
      const completionTokens = asNumber(body.usage?.completion_tokens);
      const totalTokens = asNumber(body.usage?.total_tokens);
      return {
        provider: name,
        model: request.model,
        content,
        finishReason:
          choice?.finish_reason === "length"
            ? "length"
            : choice?.finish_reason === "tool_calls"
              ? "tool_call"
              : choice?.finish_reason === "content_filter"
                ? "content_filter"
                : "stop",
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
        },
        latencyMs,
        // Cost is computed by the service, which holds the configured price.
        costUsd: null,
        costState: "unknown_usage",
        requestId: request.requestId ?? null,
      };
    },
  });

/** Model ids this adapter will send to a hosted OpenAI-compatible endpoint. */
export const OPENAI_COMPATIBLE_MODELS: AiModelDescriptor[] = [
  { id: "gpt-4o-mini", role: "chat", contextWindowTokens: null, inputCostPerMillionUsd: null, outputCostPerMillionUsd: null, maxOutputTokens: null },
  { id: "gpt-4o", role: "chat", contextWindowTokens: null, inputCostPerMillionUsd: null, outputCostPerMillionUsd: null, maxOutputTokens: null },
];

export const openAiProvider = (): HttpAiProvider =>
  openAiCompatibleProvider(
    "openai_compatible",
    process.env.AI_OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    "OPENAI_API_KEY",
    OPENAI_COMPATIBLE_MODELS,
  );

/**
 * Local/self-hosted server (Ollama, vLLM, LM Studio).
 *
 * A self-hosted server can serve any model id, so nothing is invented here: the
 * operator declares the ids in `AI_LOCAL_MODELS` (comma separated). With no such
 * declaration the provider is registered but can serve no model, and a call is
 * refused rather than sent to a made-up model name.
 */
export const localProvider = (): HttpAiProvider => {
  const declared = (process.env.AI_LOCAL_MODELS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return openAiCompatibleProvider(
    "local",
    process.env.AI_LOCAL_BASE_URL ?? "http://127.0.0.1:11434/v1",
    "AI_LOCAL_API_KEY",
    declared.map((id) => ({
      id,
      role: "chat" as const,
      contextWindowTokens: null,
      inputCostPerMillionUsd: null,
      outputCostPerMillionUsd: null,
      maxOutputTokens: null,
    })),
  );
};

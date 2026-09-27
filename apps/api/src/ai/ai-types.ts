// Provider-neutral AI boundary — the ONLY way this codebase is allowed to talk
// to a language model.
//
// GOLDEN RULE (RULE 5): an AI response can SUGGEST. It can never mutate business
// state. Nothing in this file writes to the database, and nothing here is
// reachable from a provider SDK except through the `AIProvider` interface. The
// call path is always:
//
//   AI provider (opaque, may be a mock)
//     -> AIResponse (validated, structured)
//       -> typed tool call
//         -> NestJS service -> authorization -> business logic -> database
//
// A provider that returns text does not get to skip the steps in between.
//
// HONESTY RULES:
//   1. A provider with no credential is `not_configured`, never "working" and
//      never silently replaced by a fabricated answer.
//   2. Cost is `null` (UNKNOWN) when the model has no configured price. It is
//      never defaulted to 0, because "we don't know what this cost" and "this
//      was free" are different facts.
//   3. Usage token counts come from the provider's own response when supplied.
//      When a provider does not report usage it is `null`, not 0.
//   4. No provider secret is ever returned, logged, audited or persisted.

/** Canonical provider identifiers. A vendor is a CONFIG value, never a branch. */
export const AI_PROVIDERS = ["openai_compatible", "anthropic", "google", "local", "mock"] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

/**
 * How a provider is configured, reported honestly by `/ai/status`.
 * - `configured`   : credential present and the adapter is implemented
 * - `not_configured`: adapter implemented, credential absent -> NOT_CONFIGURED
 * - `not_implemented`: adapter itself is a declared-but-absent capability
 * - `mock`         : deterministic offline provider used by tests/dev only
 */
export type AiProviderStatus = "configured" | "not_configured" | "not_implemented" | "mock";

export const AI_MODEL_ROLES = ["chat", "reasoning", "embedding", "vision"] as const;
export type AiModelRole = (typeof AI_MODEL_ROLES)[number];

export interface AiModelDescriptor {
  /** Provider-scoped model id, e.g. `gpt-4o-mini`. Never a secret. */
  id: string;
  role: AiModelRole;
  contextWindowTokens: number | null;
  /** USD per 1M prompt tokens. `null` = price not configured = UNKNOWN. */
  inputCostPerMillionUsd: number | null;
  /** USD per 1M completion tokens. `null` = price not configured = UNKNOWN. */
  outputCostPerMillionUsd: number | null;
  maxOutputTokens: number | null;
}

export interface AiRequest {
  /** Caller-supplied conversation. Redacted before it is stored or audited. */
  messages: AiMessage[];
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Deterministic seed; the mock provider uses it so tests are reproducible. */
  seed?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /** Structured-output contract the caller needs validated. */
  responseFormat?: "text" | "json_object";
  /** Correlation ids for the observability chain. */
  requestId?: string;
  actor?: string;
  /** Autonomy level the caller is acting at. Recorded, never escalated here. */
  autonomyLevel?: number;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export const EMPTY_USAGE_UNKNOWN: AiUsage = {
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
};

export type AiFinishReason = "stop" | "length" | "tool_call" | "content_filter" | "error";

export interface AiResponse {
  provider: AiProviderName;
  model: string;
  content: string;
  finishReason: AiFinishReason;
  usage: AiUsage;
  latencyMs: number;
  /** `null` when the model price is unknown. NEVER 0 for "unknown". */
  costUsd: number | null;
  /** `null` when usage is unknown, so cost cannot be computed. */
  costState: "computed" | "unknown_price" | "unknown_usage";
  requestId: string | null;
}

/** Typed error surface. Providers must not leak vendor SDK objects upward. */
export type AiErrorCode =
  | "NOT_CONFIGURED"
  | "NOT_IMPLEMENTED"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE"
  | "UNAUTHORIZED"
  | "UNKNOWN_MODEL"
  | "ABORTED";

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly retryable: boolean = false,
    readonly provider?: AiProviderName,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export interface AiProviderHealth {
  provider: AiProviderName;
  status: AiProviderStatus;
  implementation: "implemented" | "not_implemented";
  /** False when no credential is present. Never inferred from usage. */
  credentialPresent: boolean;
  models: AiModelDescriptor[];
  detail: string;
}

export interface AiProvider {
  readonly name: AiProviderName;
  /** Honest configuration report. Must not throw. */
  health(): AiProviderHealth;
  /** Model ids this adapter can currently serve. */
  models(): AiModelDescriptor[];
  /**
   * Perform one completion. MUST throw `AiError` on every failure path and MUST
   * NOT throw a raw vendor SDK error, so provider internals never escape.
   */
  complete(request: AiRequest): Promise<AiResponse>;
}

export const isAiProviderName = (value: string): value is AiProviderName =>
  (AI_PROVIDERS as readonly string[]).includes(value);

// The AI boundary service.
//
// This is the ONLY component allowed to call an AI provider. Everything above it
// (Boss, tools, controllers) receives structured `AIResponse` data and must go
// through normal authorization to change anything.
//
// What this service is responsible for:
//   - fail-closed provider resolution (no credential => no call)
//   - timeout + bounded retry with backoff
//   - cost accounting, where UNKNOWN stays UNKNOWN
//   - secret redaction on everything that is persisted or logged
//   - an audit row for EVERY call, successful or not
//   - autonomy gating: AI may only be invoked at or below the caller's level
//
// What this service will NEVER do:
//   - write to a business table
//   - return a fabricated completion
//   - silently fall back to a mock when a real provider was requested

import { ForbiddenException, Inject, Injectable, Logger } from "@nestjs/common";
import { prisma, type Prisma } from "@ai-os/database";
import { randomUUID } from "node:crypto";

import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";
import type { Principal } from "../security/principal";
import { AiProviderRegistry } from "./ai-provider.registry";
import { redactSecrets, redactValue } from "./ai-redaction";
import {
  AiError,
  isAiProviderName,
  type AiErrorCode,
  type AiModelDescriptor,
  type AiProviderName,
  type AiRequest,
  type AiResponse,
} from "./ai-types";

export const DEFAULT_AI_TIMEOUT_MS = 30_000;
export const MAX_AI_TIMEOUT_MS = 120_000;
export const DEFAULT_AI_MAX_RETRIES = 2;

/** Hard input ceiling, so one request cannot pin memory or inflate a bill. */
export const MAX_AI_PROMPT_CHARS = 32_000;
export const MAX_AI_OUTPUT_TOKENS = 8_192;

/**
 * Autonomy required to spend money on a model call. Invoking a paid provider is
 * an external side effect, so it is gated at the same level the CEO model uses
 * for "execute approved external action".
 */
export const AI_INVOKE_REQUIRED_AUTONOMY = 3;

/** Never persist more than this many characters of a prompt or response. */
const PREVIEW_LIMIT = 2_000;

export interface AiInvokeOptions {
  request: AiRequest;
  principal: Principal;
  provider?: AiProviderName | null;
  /** Autonomy the caller is acting at. Defaults to the Boss default of 2. */
  autonomyLevel?: number;
}

export interface AiUsageTotals {
  invocations: number;
  succeeded: number;
  failed: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  /** Rows whose price or usage could not be determined. */
  unknownCostInvocations: number;
  costState: "computed" | "unknown_price" | "unknown_usage" | "no_data";
}

const toInt = (value: unknown): number | null => {
  // `null`/`undefined`/`""` mean UNKNOWN, not zero. `Number(null)` is 0, so the
  // obvious implementation silently converted "no usage was reported" into a
  // confident `0` token total — exactly the dishonesty this boundary forbids.
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const preview = (text: string): string =>
  text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT)}...[truncated]` : text;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly registry: AiProviderRegistry,
    @Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient,
  ) {}

  // ------------------------------------------------------------------ status

  /**
   * Honest, config-derived status plus real spend recorded in the database.
   * Never claims a verified provider connection on config alone.
   *
   * `anyConfigured` comes from credentials. `anyVerified` comes from the
   * database: a provider counts as verified only if an earlier real call to it
   * actually succeeded. Configuration can never set that flag.
   */
  async status(): Promise<
    ReturnType<AiProviderRegistry["status"]> & {
      invocationTotals: AiUsageTotals;
      verifiedProviders: AiProviderName[];
    }
  > {
    const [registryStatus, invocations, totals] = await Promise.all([
      Promise.resolve(this.registry.status()),
      this.client.aiInvocation.findMany({ where: { verified: true } }),
      this.usageTotals(),
    ]);
    const verifiedProviders = [
      ...new Set(invocations.map((row) => (row as { provider: AiProviderName }).provider)),
    ].sort();
    return {
      ...registryStatus,
      // Upgrade the config-only status with real evidence. `configured` alone is
      // never enough to say a provider works.
      anyVerified: verifiedProviders.length > 0,
      verifiedProviders,
      invocationTotals: totals,
    };
  }

  models(provider?: AiProviderName | null): AiModelDescriptor[] {
    if (provider) return this.registry.get(provider)?.models() ?? [];
    return this.registry.health().flatMap((entry) => (entry.status === "configured" ? entry.models : []));
  }

  // ----------------------------------------------------------------- invoke

  /**
   * Run one completion through the boundary.
   *
   * Throws a typed `AiError` on every failure. The caller receives no partial or
   * invented result. A failed call is still recorded, with the reason.
   */
  async invoke(opts: AiInvokeOptions): Promise<AiResponse> {
    const autonomy = opts.autonomyLevel ?? 2;
    if (autonomy < AI_INVOKE_REQUIRED_AUTONOMY) {
      // Recorded as denied so the attempt is auditable, not silently dropped.
      await this.record({
        provider: opts.provider ?? "openai_compatible",
        model: opts.request.model,
        providerStatus: "not_configured",
        status: "unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetail: `autonomy ${autonomy} is below the required ${AI_INVOKE_REQUIRED_AUTONOMY} to invoke an AI provider`,
        request: opts.request,
        actor: opts.principal.id,
        autonomyLevel: autonomy,
      });
      throw new ForbiddenException(
        `AI_INVOKE_AUTONOMY_TOO_LOW: autonomy ${autonomy} is below the required ${AI_INVOKE_REQUIRED_AUTONOMY} to invoke an AI provider`,
      );
    }
    if (opts.principal.role === "viewer") {
      await this.record({
        provider: opts.provider ?? "openai_compatible",
        model: opts.request.model,
        providerStatus: "not_configured",
        status: "unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetail: `role "${opts.principal.role}" may not invoke an AI provider`,
        request: opts.request,
        actor: opts.principal.id,
        autonomyLevel: autonomy,
      });
      throw new ForbiddenException(`role "${opts.principal.role}" may not invoke an AI provider`);
    }

    const requestId = opts.request.requestId ?? randomUUID();
    const resolved = this.registry.resolve(opts.provider ?? null);
    if (!resolved) {
      // Distinguish "you named a provider I do not have" from "you named nothing
      // and nothing is configured", because those are different operator errors.
      const named = opts.provider ?? null;
      const defaultName = process.env.AI_DEFAULT_PROVIDER ?? null;
      const target = named ?? defaultName;
      const known = target !== null && isAiProviderName(target);
      const errorCode: AiErrorCode = known ? "NOT_CONFIGURED" : target ? "UNKNOWN_MODEL" : "NOT_CONFIGURED";
      const detail = named
        ? known
          ? `AI provider "${named}" is not configured: no credential is present`
          : `unknown AI provider "${named}"`
        : defaultName
          ? `AI_DEFAULT_PROVIDER="${defaultName}" does not name a known provider`
          : "no AI provider is configured: set AI_DEFAULT_PROVIDER and the provider credential";

      await this.record({
        provider: known ? target : "openai_compatible",
        model: opts.request.model,
        providerStatus: "not_configured",
        status: "not_configured",
        errorCode,
        errorDetail: detail,
        request: opts.request,
        actor: opts.principal.id,
        autonomyLevel: autonomy,
        requestId,
      });
      throw new AiError(errorCode, `${detail}. No completion was produced.`, false, known ? target : undefined);
    }

    const { provider, mocked } = resolved;
    const health = provider.health();
    if (!mocked && health.status !== "configured") {
      await this.record({
        provider: provider.name,
        model: opts.request.model,
        providerStatus: health.status,
        status: health.status === "not_implemented" ? "not_implemented" : "not_configured",
        errorCode: health.status === "not_implemented" ? "NOT_IMPLEMENTED" : "NOT_CONFIGURED",
        errorDetail: health.detail,
        request: opts.request,
        actor: opts.principal.id,
        autonomyLevel: autonomy,
        requestId,
      });
      throw new AiError(
        health.status === "not_implemented" ? "NOT_IMPLEMENTED" : "NOT_CONFIGURED",
        `AI provider "${provider.name}" is ${health.status.toUpperCase()}. No completion was produced.`,
        false,
        provider.name,
      );
    }
    if (mocked) {
      this.logger.warn(
        `AI invocation is served by the deterministic MOCK provider, not a real model (actor=${opts.principal.id})`,
      );
    }

    const request: AiRequest = { ...opts.request, requestId };
    const models = provider.models();
    // Validate the request BEFORE spending money on it. A model id the adapter
    // does not serve is refused rather than forwarded, so a typo or an attempt
    // to smuggle a premium model cannot reach a billable endpoint.
    this.assertRequest(request, models, provider.name, mocked);
    const maxRetries = Math.max(0, Math.min(5, request.maxRetries ?? DEFAULT_AI_MAX_RETRIES));
    let lastError: AiError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        // The timeout is enforced HERE as well as inside the HTTP adapter, so a
        // slow provider of any kind is bounded rather than hanging a request.
        const raw = await this.withTimeout(provider.complete(request), request, provider.name);
        // Cost is computed HERE, not in the adapter, because only the service
        // knows the configured price for the model.
        const response = this.withCost(raw, models);
        await this.record({
          provider: provider.name,
          model: response.model,
          providerStatus: health.status,
          status: "success",
          request,
          response,
          actor: opts.principal.id,
          autonomyLevel: autonomy,
          requestId,
          // A real provider call that succeeded is the only thing that counts
          // as verified. The mock never sets this.
          verified: !mocked,
        });
        return response;
      } catch (error) {
        const aiError =
          error instanceof AiError
            ? error
            : new AiError(
                "PROVIDER_ERROR",
                error instanceof Error ? error.message : "unknown provider failure",
                true,
                provider.name,
              );
        lastError = aiError;
        if (!aiError.retryable || attempt === maxRetries) break;
        await this.sleep(this.backoffMs(attempt));
      }
    }

    const failure = lastError ?? new AiError("PROVIDER_ERROR", "AI call failed for an unknown reason", false, provider.name);
    await this.record({
      provider: failure.provider ?? provider.name,
      model: request.model,
      providerStatus: health.status,
      status: STATUS_FOR_ERROR[failure.code] ?? "provider_error",
      request,
      errorCode: failure.code,
      errorDetail: failure.message,
      actor: opts.principal.id,
      autonomyLevel: autonomy,
      requestId,
    });
    this.logger.warn(`AI invocation failed: ${failure.code}: ${failure.message}`);
    throw failure;
  }

  // ------------------------------------------------------------------ reads

  /** Aggregated spend. UNKNOWN totals stay null rather than becoming 0. */
  async usageTotals(since?: Date): Promise<AiUsageTotals> {
    const rows = await this.client.aiInvocation.findMany({
      where: since ? { createdAt: { gte: since } } : {},
    });
    if (rows.length === 0) return { ...EMPTY_TOTALS };

    const sum = (pick: (row: Record<string, unknown>) => number | null): number | null => {
      const values = rows.map((row) => pick(row as Record<string, unknown>)).filter((v): v is number => v !== null);
      return values.length === 0 ? null : values.reduce((a, b) => a + b, 0);
    };
    // A total is only reported when EVERY row is known. One unknown row makes
    // the total unknown, because a partial sum presented as a total is a lie.
    const strictSum = (pick: (row: Record<string, unknown>) => number | null): number | null => {
      const values = rows.map((row) => pick(row as Record<string, unknown>));
      return values.every((v): v is number => v !== null) ? values.reduce((a, b) => a + b, 0) : null;
    };

    const succeeded = rows.filter((row) => row.status === "success").length;
    const costUsd = strictSum((row) => (row.costUsd === null ? null : Number(row.costUsd)));
    const unknownCost = rows.filter((row) => row.costState !== "computed").length;

    return {
      invocations: rows.length,
      succeeded,
      failed: rows.length - succeeded,
      promptTokens: sum((row) => toInt(row.promptTokens)),
      completionTokens: sum((row) => toInt(row.completionTokens)),
      totalTokens: sum((row) => toInt(row.totalTokens)),
      costUsd,
      unknownCostInvocations: unknownCost,
      costState:
        rows.length === 0
          ? "no_data"
          : costUsd === null
            ? rows.every((row) => row.costState === "unknown_price")
              ? "unknown_price"
              : "unknown_usage"
            : unknownCost > 0
              ? "unknown_usage"
              : "computed",
    };
  }

  async listInvocations(opts: { limit?: number; provider?: string; status?: string } = {}): Promise<unknown[]> {
    return this.client.aiInvocation.findMany({
      where: {
        ...(opts.provider ? { provider: opts.provider } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.max(1, Math.min(200, opts.limit ?? 50)),
    });
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Reject malformed or unbounded requests before any provider is contacted.
   * Throws `AiError`, so the controller maps it to a 4xx the same way it maps
   * every other boundary failure.
   */
  private assertRequest(
    request: AiRequest,
    models: AiModelDescriptor[],
    provider: AiProviderName,
    mocked: boolean,
  ): void {
    const reject = (code: AiErrorCode, message: string): never => {
      throw new AiError(code, message, false, provider);
    };

    if (!Array.isArray(request.messages) || request.messages.length === 0) {
      reject("INVALID_RESPONSE", "AI request must contain at least one message");
    }
    const totalChars = request.messages.reduce((total, m) => total + (m?.content?.length ?? 0), 0);
    if (totalChars === 0) reject("INVALID_RESPONSE", "AI request messages must contain text");
    if (totalChars > MAX_AI_PROMPT_CHARS) {
      reject(
        "INVALID_RESPONSE",
        `AI request is ${totalChars} characters, above the ${MAX_AI_PROMPT_CHARS} character limit`,
      );
    }
    if (typeof request.model !== "string" || request.model.trim().length === 0) {
      reject("UNKNOWN_MODEL", "AI request must name a model");
    }
    if (typeof request.temperature === "number") {
      if (!Number.isFinite(request.temperature) || request.temperature < 0 || request.temperature > 2) {
        reject("INVALID_RESPONSE", "temperature must be a number between 0 and 2");
      }
    }
    if (typeof request.maxOutputTokens === "number") {
      const ceiling = MAX_AI_OUTPUT_TOKENS;
      if (
        !Number.isInteger(request.maxOutputTokens) ||
        request.maxOutputTokens < 1 ||
        request.maxOutputTokens > ceiling
      ) {
        reject("INVALID_RESPONSE", `maxOutputTokens must be an integer between 1 and ${ceiling}`);
      }
    }

    // The mock is a test double with exactly one model; anything else is a caller
    // error rather than a missing capability.
    if (mocked) return;
    if (models.length === 0) {
      reject("NOT_CONFIGURED", `provider "${provider}" declares no servable models, so it cannot serve a request`);
    }
    if (!models.some((m) => m.id === request.model)) {
      const offered = models.map((m) => m.id).slice(0, 10).join(", ");
      reject(
        "UNKNOWN_MODEL",
        `provider "${provider}" does not serve model "${request.model}"${
          offered ? `; it serves: ${offered}` : ""
        }`,
      );
    }
  }

  private withCost(response: AiResponse, models: AiModelDescriptor[]): AiResponse {
    const descriptor = models.find((m) => m.id === response.model);
    if (!descriptor) {
      return { ...response, costUsd: null, costState: "unknown_price" };
    }
    const { promptTokens, completionTokens } = response.usage;
    if (promptTokens === null || completionTokens === null) {
      return { ...response, costUsd: null, costState: "unknown_usage" };
    }
    if (descriptor.inputCostPerMillionUsd === null || descriptor.outputCostPerMillionUsd === null) {
      return { ...response, costUsd: null, costState: "unknown_price" };
    }
    const cost =
      (promptTokens * descriptor.inputCostPerMillionUsd + completionTokens * descriptor.outputCostPerMillionUsd) /
      1_000_000;
    return { ...response, costUsd: Number(cost.toFixed(6)), costState: "computed" };
  }

  private backoffMs(attempt: number): number {
    return Math.min(4_000, 250 * 2 ** attempt);
  }

  /** Bound any provider call, including a misbehaving non-HTTP adapter. */
  private withTimeout<T>(work: Promise<T>, request: AiRequest, provider: AiProviderName): Promise<T> {
    const timeoutMs = Math.min(
      Math.max(1_000, request.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS),
      MAX_AI_TIMEOUT_MS,
    );
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new AiError("TIMEOUT", `AI provider "${provider}" did not respond within ${timeoutMs}ms`, true, provider),
          ),
        timeoutMs,
      );
      work.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Every call, successful or not, leaves one redacted row. */
  private async record(entry: {
    provider: AiProviderName;
    model: string;
    providerStatus: string;
    status: string;
    request: AiRequest;
    response?: AiResponse;
    errorCode?: string;
    errorDetail?: string;
    actor: string;
    autonomyLevel: number;
    requestId?: string;
    verified?: boolean;
  }): Promise<void> {
    try {
      await this.client.aiInvocation.create({
        data: {
          requestId: entry.requestId ?? entry.request.requestId ?? null,
          provider: entry.provider,
          model: entry.model,
          providerStatus: entry.providerStatus,
          status: entry.status,
          promptChars: entry.request.messages.reduce((total, m) => total + m.content.length, 0),
          responseChars: entry.response ? entry.response.content.length : null,
          promptTokens: entry.response?.usage.promptTokens ?? null,
          completionTokens: entry.response?.usage.completionTokens ?? null,
          totalTokens: entry.response?.usage.totalTokens ?? null,
          costUsd: entry.response?.costUsd ?? null,
          costState: entry.response?.costState ?? "unknown_usage",
          latencyMs: entry.response?.latencyMs ?? null,
          finishReason: entry.response?.finishReason ?? null,
          // Redacted: a credential must never reach the database.
          requestPreview: {
            messages: entry.request.messages.map((m) => ({
              role: m.role,
              content: preview(redactSecrets(m.content)),
            })),
            model: entry.model,
            responseFormat: entry.request.responseFormat ?? "text",
          } as unknown as Prisma.InputJsonValue,
          responsePreview: entry.response
            ? (redactValue({ content: preview(entry.response.content) }) as Prisma.InputJsonValue)
            : undefined,
          errorCode: entry.errorCode ?? null,
          errorDetail: entry.errorDetail ? redactSecrets(entry.errorDetail).slice(0, 500) : null,
          actor: entry.actor,
          autonomyLevel: entry.autonomyLevel,
          verified: entry.verified ?? false,
        },
      });
    } catch (error) {
      // A usage-accounting failure must never mask the real outcome, but it
      // must be loud — silent loss of spend data is how costs become unknown.
      this.logger.error(
        `failed to record AI invocation (${entry.provider}/${entry.model}/${entry.status}): ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }
}

const EMPTY_TOTALS: AiUsageTotals = {
  invocations: 0,
  succeeded: 0,
  failed: 0,
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  costUsd: null,
  unknownCostInvocations: 0,
  costState: "no_data",
};

const STATUS_FOR_ERROR: Record<string, string> = {
  NOT_CONFIGURED: "not_configured",
  NOT_IMPLEMENTED: "not_implemented",
  TIMEOUT: "timeout",
  RATE_LIMITED: "rate_limited",
  PROVIDER_ERROR: "provider_error",
  INVALID_RESPONSE: "invalid_response",
  UNAUTHORIZED: "unauthorized",
  UNKNOWN_MODEL: "not_configured",
  ABORTED: "provider_error",
};

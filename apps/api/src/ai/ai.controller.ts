// HTTP surface for the AI boundary.
//
// Deliberately read-mostly. The one write-shaped route (`/ai/invoke`) returns a
// COMPLETION and nothing else: it cannot create, update or delete any business
// record. Anything an AI suggests still has to travel through a typed tool and
// a NestJS service before it can touch the database (RULE 5).

import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Post,
  Query,
  ServiceUnavailableException,
} from "@nestjs/common";

import { AiService } from "./ai.service";
import { AI_PROVIDERS, AiError, isAiProviderName, type AiProviderName } from "./ai-types";
import { resolveEffectiveAutonomy } from "../security/autonomy";
import { CurrentPrincipal, type Principal } from "../security/principal";

/**
 * Translate a typed boundary error into an HTTP status. The service deliberately
 * throws `AiError` (not HTTP exceptions) so the boundary stays transport
 * agnostic and the same error is usable from a queue worker or a tool.
 */
const toHttpException = (error: AiError): HttpException => {
  const message = `${error.code}: ${error.message}`;
  switch (error.code) {
    case "UNAUTHORIZED":
      return new HttpException(message, HttpStatus.FORBIDDEN);
    case "NOT_CONFIGURED":
    case "NOT_IMPLEMENTED":
      return new ServiceUnavailableException(message);
    case "RATE_LIMITED":
      return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    case "TIMEOUT":
      return new GatewayTimeoutException(message);
    case "INVALID_RESPONSE":
    case "UNKNOWN_MODEL":
      return new BadRequestException(message);
    case "ABORTED":
      return new BadRequestException(message);
    default:
      return new BadGatewayException(message);
  }
};

@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** Honest AI capability report. Safe to render directly in a UI. */
  @Get("status")
  async status() {
    return this.ai.status();
  }

  @Get("providers")
  providers() {
    return { providers: AI_PROVIDERS, available: this.ai.models() };
  }

  @Get("invocations")
  async invocations(@Query("limit") limit?: string, @Query("provider") provider?: string) {
    return {
      invocations: await this.ai.listInvocations({
        limit: limit ? Number(limit) : undefined,
        provider,
      }),
    };
  }

  @Get("usage")
  usage() {
    return this.ai.usageTotals();
  }

  /**
   * Run one completion.
   *
   * This route can only return a COMPLETION. It cannot create, update or delete
   * any business record (RULE 5): anything an AI suggests must still travel
   * through a typed tool and a NestJS service to reach the database.
   *
   * Authorization is enforced in the service against the AUTHENTICATED
   * principal. `autonomyLevel` is a REQUEST, not an authority: it is validated
   * against the level set, then capped by the server-side
   * `OPERATOR_AUTONOMY_CEILING` (default 2), with level 5 reserved for an owner
   * principal plus an explicit opt-in. The effective level is what gets written
   * to the audit row. It is never silently raised, and a value below 3 is
   * refused by the service.
   */
  @Post("invoke")
  async invoke(
    @Body()
    body: {
      model?: string;
      provider?: string;
      messages?: { role?: string; content?: string }[];
      temperature?: number;
      maxOutputTokens?: number;
      responseFormat?: "text" | "json_object";
      timeoutMs?: number;
      maxRetries?: number;
      autonomyLevel?: number;
    },
    @CurrentPrincipal() principal: Parameters<AiService["invoke"]>[0]["principal"],
  ) {
    // Unknown provider names are an error, not something to quietly drop: a typo
    // that silently became "use the default" is how the wrong model gets billed.
    if (body.provider !== undefined && !isAiProviderName(body.provider)) {
      throw new BadRequestException(`unknown AI provider "${body.provider}"; known providers: ${AI_PROVIDERS.join(", ")}`);
    }
    const provider = body.provider ? (body.provider as AiProviderName) : null;
    if (typeof body.model !== "string" || body.model.trim().length === 0) {
      throw new BadRequestException("model is required");
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      throw new BadRequestException("at least one message is required");
    }
    const messages = body.messages.map((m) => {
      if (typeof m?.content !== "string" || m.content.trim().length === 0) {
        throw new BadRequestException("every message must have non-empty string content");
      }
      if (m.role !== undefined && m.role !== "system" && m.role !== "user" && m.role !== "assistant") {
        throw new BadRequestException(`unknown message role "${m.role}"; expected system, user or assistant`);
      }
      return { role: (m.role ?? "user") as "system" | "user" | "assistant", content: m.content };
    });
    if (body.responseFormat !== undefined && body.responseFormat !== "text" && body.responseFormat !== "json_object") {
      throw new BadRequestException('responseFormat must be "text" or "json_object"');
    }
    const autonomyLevel = this.assertAutonomy(body.autonomyLevel, principal);

    const response = await this.ai
      .invoke({
        principal,
        provider,
        autonomyLevel,
        request: {
          messages,
          model: body.model,
          temperature: typeof body.temperature === "number" ? body.temperature : undefined,
          maxOutputTokens: typeof body.maxOutputTokens === "number" ? body.maxOutputTokens : undefined,
          responseFormat: body.responseFormat,
          timeoutMs: typeof body.timeoutMs === "number" ? body.timeoutMs : undefined,
          maxRetries: typeof body.maxRetries === "number" ? body.maxRetries : undefined,
        },
      })
      .catch((error: unknown) => {
        if (error instanceof AiError) throw toHttpException(error);
        throw error;
      });
    // Only the completion crosses the wire. No usage internals leak to the client.
    return {
      provider: response.provider,
      model: response.model,
      content: response.content,
      finishReason: response.finishReason,
      requestId: response.requestId,
    };
  }

  /**
   * Same level set the Boss uses, the same fail-closed default, and the same
   * server-side ceiling. A declared level is a request: the persisted level is
   * capped by the deployment, and level 5 additionally requires an owner
   * principal plus an explicit opt-in (RULE 10).
   */
  private assertAutonomy(value: number | undefined, principal: Principal): number {
    return resolveEffectiveAutonomy({ requested: value, principal }).effective;
  }
}

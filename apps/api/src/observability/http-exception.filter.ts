import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";

import { STATUS_CODES } from "node:http";

// Global exception filter (Phase-09 hardening, observability slice).
//
// Every error response becomes a consistent JSON shape:
//   { statusCode, error, message, path, timestamp }
// The internal detail of ANY 5xx is never returned to the client: the full
// stack/message is logged server-side and the client sees a generic message.
// 4xx messages are the application's own (safe, already validated).
//
// SECURITY RELEVANT 4xx ARE ALWAYS LOGGED: failed authentication (401) and
// throttling (429) are the two responses an attacker produces most, and they
// were previously invisible because only 5xx reached the logger. The credential
// itself is never logged — only method, path, status and the route it targeted.

import { PRINCIPAL_KEY, type Principal } from "../security/principal";

/** Statuses that are logged at WARN because they indicate abuse or auth failure. */
export const SECURITY_RELEVANT_STATUSES: readonly number[] = [401, 403, 429];

export function formatSecurityLog(meta: {
  method: string;
  path: string;
  status: number;
  principalId?: string;
}): string {
  const who = meta.principalId && meta.principalId.length > 0 ? ` (principal: ${meta.principalId})` : "";
  return `${meta.method} ${meta.path} -> ${meta.status}${who}`;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exception");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const path = req.originalUrl ?? req.url ?? "/";
    const timestamp = new Date().toISOString();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "Internal server error";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (status < 500) {
        message =
          typeof response === "string"
            ? response
            : typeof response === "object" && response !== null && "message" in response
              ? (response as { message: string | string[] }).message
              : exception.message;
      }
    }

    if (status >= 500) {
      const detail = exception instanceof Error ? exception.stack ?? exception.message : String(exception);
      this.logger.error(`${req.method} ${path} -> ${status}`, detail);
    } else if (SECURITY_RELEVANT_STATUSES.includes(status)) {
      // 401/403/429 mean someone was refused or throttled: log them so abuse is
      // visible, without ever recording the credential that was presented.
      const principal = (req as unknown as Record<string, unknown>)[PRINCIPAL_KEY] as Principal | undefined;
      this.logger.warn(formatSecurityLog({ method: req.method, path, status, principalId: principal?.id }));
    }

    res
      .status(status)
      .json({ statusCode: status, error: STATUS_CODES[status] ?? "Error", message, path, timestamp });
  }
}
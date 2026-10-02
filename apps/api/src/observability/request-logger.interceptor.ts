import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

import { CORRELATION_ID_REQ_KEY } from "./correlation-id.interceptor";

// Request observability (Phase-09 hardening slice). Every completed request is
// logged at INFO with method, path, status and duration. Error responses are
// logged separately by AllExceptionsFilter (only successes/redirects surface
// here). Log lines are produced by the pure formatLogLine() helper so they can
// be unit-tested without a live HTTP server.

export interface LogMeta {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  correlationId?: string | null;
}

export function formatLogLine(meta: LogMeta): string {
  const cid = meta.correlationId ? ` [cid=${meta.correlationId}]` : "";
  return `${meta.method} ${meta.path} -> ${meta.status} in ${meta.durationMs}ms${cid}`;
}

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const method = req.method ?? "GET";
    const path = req.originalUrl ?? req.url ?? "/";
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const status = typeof res.statusCode === "number" ? res.statusCode : 200;
          const cid = (req as unknown as Record<string, unknown>)[CORRELATION_ID_REQ_KEY] as
            string | undefined;
          this.logger.log(
            formatLogLine({ method, path, status, durationMs: Date.now() - startedAt, correlationId: cid }),
          );
        },
      }),
    );
  }
}
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { Observable } from "rxjs";

import {
  CORRELATION_ID_HEADER,
  generateCorrelationId,
  normalizeCorrelationId,
} from "./correlation";

export const CORRELATION_ID_REQ_KEY = "correlationId";

/**
 * Ensures every request has a correlation ID attached to req[CORRELATION_ID_REQ_KEY].
 * If the client supplies x-correlation-id (validated/trimmed), we preserve it.
 * Otherwise we generate one once at the HTTP boundary. This ID is never returned
 * to the client and contains no secrets.
 */
@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & Record<string, unknown>>();
    const header = req.headers?.[CORRELATION_ID_HEADER];
    const existing = Array.isArray(header) ? header[0] : header;
    const cid = normalizeCorrelationId(existing) ?? generateCorrelationId();
    req[CORRELATION_ID_REQ_KEY] = cid;
    return next.handle();
  }
}
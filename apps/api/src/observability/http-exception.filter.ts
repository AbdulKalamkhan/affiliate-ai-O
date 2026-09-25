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

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
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
    }

    res
      .status(status)
      .json({ statusCode: status, error: STATUS_CODES[status] ?? "Error", message, path, timestamp });
  }
}
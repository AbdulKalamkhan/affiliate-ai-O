import { Logger } from "@nestjs/common";
import type { CallHandler } from "@nestjs/common";
import { of } from "rxjs";
import { formatLogLine, RequestLoggerInterceptor } from "./request-logger.interceptor";

describe("formatLogLine", () => {
  it("formats method, path, status and duration", () => {
    expect(formatLogLine({ method: "GET", path: "/health", status: 200, durationMs: 12 })).toBe(
      "GET /health -> 200 in 12ms",
    );
  });
});

describe("RequestLoggerInterceptor", () => {
  let loggerLogSpy: jest.SpyInstance;

  const makeContext = () => {
    const response = { statusCode: 201 } as { statusCode: number };
    const request = { method: "POST", originalUrl: "/revenue-events", url: "/revenue-events" };
    return {
      context: {
        switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
      },
    };
  };

  beforeEach(() => {
    loggerLogSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
  });

  it("logs the completed request with its status and a non-negative duration", async () => {
    const { context } = makeContext();
    const interceptor = new RequestLoggerInterceptor();
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await interceptor.intercept(context as never, next).toPromise();

    expect(loggerLogSpy).toHaveBeenCalledTimes(1);
    const line = loggerLogSpy.mock.calls[0][0] as string;
    expect(line).toContain("POST /revenue-events -> 201");
    expect(line).toMatch(/in \d+ms$/);
  });

  it("keeps the response flowing through unchanged", async () => {
    const { context } = makeContext();
    const interceptor = new RequestLoggerInterceptor();
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await expect(interceptor.intercept(context as never, next).toPromise()).resolves.toEqual({ ok: true });
  });
});
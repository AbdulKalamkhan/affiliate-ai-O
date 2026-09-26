import { BadRequestException, HttpException, HttpStatus, UnauthorizedException } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import type { ArgumentsHost } from "@nestjs/common";
import { AllExceptionsFilter } from "./http-exception.filter";

describe("AllExceptionsFilter", () => {
  let filter: AllExceptionsFilter;
  let loggerErrorSpy: jest.SpyInstance;

  const makeHost = (path = "/test", method = "GET"): { host: ArgumentsHost; response: Response } => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;
    const request = { originalUrl: path, url: path, method } as Request;
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
    return { host, response };
  };

  const thrownBody = (response: Response): Record<string, unknown> =>
    (response.json as unknown as jest.Mock).mock.calls[0][0] as Record<string, unknown>;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    loggerErrorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it("renders 4xx as a consistent JSON body and keeps the app's own message", () => {
    const { host, response } = makeHost("/affiliate-links", "POST");
    filter.catch(new BadRequestException("url is required"), host);
    expect(response.status).toHaveBeenCalledWith(400);
    const body = thrownBody(response);
    expect(body).toMatchObject({
      statusCode: 400,
      error: "Bad Request",
      message: "url is required",
      path: "/affiliate-links",
    });
    expect(typeof body.timestamp).toBe("string");
  });

  it("passes through UnauthorizedException with the fail-closed 401 shape", () => {
    const { host, response } = makeHost("/dashboard/overview");
    filter.catch(new UnauthorizedException(), host);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    const body = thrownBody(response);
    expect(body).toMatchObject({ statusCode: 401, error: "Unauthorized", path: "/dashboard/overview" });
  });

  it("masks an unexpected error to a generic 500 and never leaks internal detail", () => {
    const { host, response } = makeHost("/boss/commands");
    filter.catch(new Error("database credentials leaked in the connection string"), host);
    expect(response.status).toHaveBeenCalledWith(500);
    const body = thrownBody(response);
    expect(body.message).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toMatch(/credential/i);
  });

  it("masks the message of a 5xx HttpException too (server-side log only)", () => {
    const { host, response } = makeHost("/x");
    filter.catch(new HttpException("sensitive internal reason", HttpStatus.INTERNAL_SERVER_ERROR), host);
    expect(response.status).toHaveBeenCalledWith(500);
    const body = thrownBody(response);
    expect(body.message).toBe("Internal server error");
    expect(body.error).toBe("Internal Server Error");
  });

  it("logs server-side detail for 5xx responses", () => {
    const { host } = makeHost("/boom");
    filter.catch(new Error("stack trace detail"), host);
    expect(loggerErrorSpy).toHaveBeenCalled();
    expect(JSON.stringify(loggerErrorSpy.mock.calls[0][1])).toContain("stack trace detail");
  });

  it("does not log for an ordinary 4xx client error", () => {
    const { host } = makeHost("/bad");
    filter.catch(new BadRequestException("your input"), host);
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  describe("security-relevant 4xx logging", () => {
    let loggerWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      loggerWarnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => {
      loggerWarnSpy.mockRestore();
    });

    it("logs a failed authentication (401) so refusals are never invisible", () => {
      const { host } = makeHost("/boss/actions", "POST");
      filter.catch(new UnauthorizedException("Invalid or missing API key"), host);
      expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
      expect(loggerWarnSpy.mock.calls[0][0]).toContain("POST /boss/actions -> 401");
    });

    it("logs a throttled request (429)", () => {
      const { host } = makeHost("/affiliate-links/x/click");
      filter.catch(new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS), host);
      expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
      expect(loggerWarnSpy.mock.calls[0][0]).toContain("-> 429");
    });

    it("names the principal when one was attached, and never logs a credential", () => {
      const { host } = makeHost("/content-qa/approvals", "POST");
      const request = (host as unknown as { switchToHttp: () => { getRequest: () => Record<string, unknown> } })
        .switchToHttp()
        .getRequest();
      request.principal = { id: "api-key-owner", role: "owner", authMethod: "api_key" };
      filter.catch(new UnauthorizedException("nope"), host);
      const line = String(loggerWarnSpy.mock.calls[0][0]);
      expect(line).toContain("principal: api-key-owner");
      expect(line).not.toMatch(/bearer|api[_ ]?key\s*[=:]/i);
    });

    it("stays silent for a plain 400", () => {
      const { host } = makeHost("/x");
      filter.catch(new BadRequestException("bad input"), host);
      expect(loggerWarnSpy).not.toHaveBeenCalled();
    });
  });
});
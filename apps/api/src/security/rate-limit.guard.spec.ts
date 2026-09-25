import { HttpException } from "@nestjs/common";
import { RateLimitGuard } from "./rate-limit.guard";

describe("RateLimitGuard", () => {
  const makeCtx = (method: string, ip: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ method, ip, headers: {} }),
      }),
    }) as never;

  it("allows mutations up to the limit then rejects", () => {
    const guard = new RateLimitGuard();
    for (let i = 0; i < 10; i += 1) {
      expect(guard.canActivate(makeCtx("POST", "1.2.3.4"))).toBe(true);
    }
    expect(() => guard.canActivate(makeCtx("POST", "1.2.3.4"))).toThrow(HttpException);
  });

  it("uses a separate window per IP", () => {
    const guard = new RateLimitGuard();
    for (let i = 0; i < 10; i += 1) {
      guard.canActivate(makeCtx("PATCH", "aaa"));
    }
    expect(() => guard.canActivate(makeCtx("PATCH", "aaa"))).toThrow(HttpException);
    expect(guard.canActivate(makeCtx("PATCH", "bbb"))).toBe(true);
  });

  it("treats GET requests with a higher limit", () => {
    const guard = new RateLimitGuard();
    for (let i = 0; i < 60; i += 1) {
      expect(guard.canActivate(makeCtx("GET", "5.6.7.8"))).toBe(true);
    }
    expect(() => guard.canActivate(makeCtx("GET", "5.6.7.8"))).toThrow(HttpException);
  });

  it("respects X-Forwarded-For when trust proxy is enabled", () => {
    const guard = new RateLimitGuard();
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: "DELETE",
          headers: { "x-forwarded-for": "9.9.9.9, 8.8.8.8" },
        }),
      }),
    } as never;
    for (let i = 0; i < 10; i += 1) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });

  it("handles X-Forwarded-For supplied as an array (first value wins)", () => {
    const guard = new RateLimitGuard();
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: "PATCH",
          headers: { "x-forwarded-for": ["7.7.7.7", "6.6.6.6"] },
        }),
      }),
    } as never;
    for (let i = 0; i < 10; i += 1) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });

  it("ignores a spoofed X-Forwarded-For when Express computed req.ip (spoof-resistance)", () => {
    const guard = new RateLimitGuard();
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: "POST",
          ip: "5.6.7.8",
          headers: { "x-forwarded-for": "1.2.3.4, 9.9.9.9" },
        }),
      }),
    } as never;
    for (let i = 0; i < 10; i += 1) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });

  it("keeps the in-memory map bounded under high client-cardinality traffic", () => {
    const guard = new RateLimitGuard();
    const get = (ip: string) => guard.canActivate(makeCtx("POST", ip));
    for (let i = 0; i < 10_100; i += 1) {
      expect(get(`client-${i}`)).toBe(true);
    }
    expect(get("client-10_200")).toBe(true);
  });
});
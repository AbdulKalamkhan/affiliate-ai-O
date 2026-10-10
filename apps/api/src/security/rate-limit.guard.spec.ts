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

  it("uses the first IPv4-mapped IPv6 entry when req.ip is absent", () => {
    const guard = new RateLimitGuard();
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: "PUT",
          headers: { "x-forwarded-for": "::ffff:203.0.113.7, ::ffff:198.51.100.9" },
        }),
      }),
    } as never;
    for (let i = 0; i < 10; i += 1) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });

  it("ignores a spoofed IPv4-mapped IPv6 X-Forwarded-For when req.ip is present", () => {
    const guard = new RateLimitGuard();
    const ctxWithHeader = (header: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            method: "PATCH",
            ip: "203.0.113.99",
            headers: { "x-forwarded-for": header },
          }),
        }),
      }) as never;
    // A rotating spoofed header must not mint a fresh identity per request:
    // the window stays keyed on the server-computed req.ip.
    for (let i = 0; i < 10; i += 1) {
      expect(guard.canActivate(ctxWithHeader(`::ffff:10.0.0.${i}`))).toBe(true);
    }
    expect(() => guard.canActivate(ctxWithHeader("::ffff:10.0.0.99"))).toThrow(HttpException);
  });

  it("scopes the fallback IPv4-mapped header per distinct first entry", () => {
    const guard = new RateLimitGuard();
    const ctxFor = (first: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            method: "POST",
            headers: { "x-forwarded-for": `${first}, 198.51.100.1` },
          }),
        }),
      }) as never;
    for (let i = 0; i < 10; i += 1) {
      guard.canActivate(ctxFor("::ffff:192.0.2.10"));
    }
    expect(() => guard.canActivate(ctxFor("::ffff:192.0.2.10"))).toThrow(HttpException);
    expect(guard.canActivate(ctxFor("::ffff:192.0.2.11"))).toBe(true);
  });
});
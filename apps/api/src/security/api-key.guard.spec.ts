import { Reflector } from "@nestjs/core";
import { ApiKeyGuard } from "./api-key.guard";
import { Public } from "./public.decorator";
import { PRINCIPAL_KEY, type Principal } from "./principal";

describe("ApiKeyGuard", () => {
  const oldKey = process.env.API_KEY;
  afterAll(() => {
    if (oldKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = oldKey;
    }
  });

  const makeCtx = (target: object) =>
    ({
      getHandler: () => target,
      getClass: () => target,
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    }) as never;

  @Public()
  class PublicStub {}

  class ProtectedStub {}

  it("allows public routes without a key", () => {
    const guard = new ApiKeyGuard(new Reflector());
    expect(guard.canActivate(makeCtx(PublicStub))).toBe(true);
  });

  it("rejects protected routes when API_KEY is not configured", () => {
    delete process.env.API_KEY;
    const guard = new ApiKeyGuard(new Reflector());
    expect(() => guard.canActivate(makeCtx(ProtectedStub))).toThrow("not configured");
  });

  it("rejects protected routes when the wrong key is supplied", () => {
    process.env.API_KEY = "expected-key";
    const request = { headers: { authorization: "Bearer wrong-key" } };
    const ctx = {
      getHandler: () => ProtectedStub,
      getClass: () => ProtectedStub,
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;
    const guard = new ApiKeyGuard(new Reflector());
    expect(() => guard.canActivate(ctx)).toThrow("Invalid or missing API key");
  });

  it("allows protected routes with the matching key", () => {
    process.env.API_KEY = "expected-key";
    const request = { headers: { authorization: "Bearer expected-key" } };
    const ctx = {
      getHandler: () => ProtectedStub,
      getClass: () => ProtectedStub,
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;
    const guard = new ApiKeyGuard(new Reflector());
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("attaches an authenticated OWNER principal to an authorized request", () => {
    process.env.API_KEY = "expected-key";
    const request: Record<string, unknown> = { headers: { authorization: "Bearer expected-key" } };
    const ctx = {
      getHandler: () => ProtectedStub,
      getClass: () => ProtectedStub,
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;
    new ApiKeyGuard(new Reflector()).canActivate(ctx);
    // The principal is what an approval is attributed to, so it must exist and
    // must never be the raw credential.
    const principal = request[PRINCIPAL_KEY] as Principal;
    expect(principal.role).toBe("owner");
    expect(principal.id).toBe("api-key-owner");
    expect(principal.id).not.toContain("expected-key");
  });

  it("attaches an anonymous principal on public routes instead of guessing a caller", () => {
    const request: Record<string, unknown> = { headers: {} };
    const ctx = {
      getHandler: () => PublicStub,
      getClass: () => PublicStub,
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;
    new ApiKeyGuard(new Reflector()).canActivate(ctx);
    expect((request[PRINCIPAL_KEY] as Principal).id).toBe("anonymous");
  });

  it("attaches NO principal when authentication fails", () => {
    process.env.API_KEY = "expected-key";
    const request: Record<string, unknown> = { headers: { authorization: "Bearer wrong" } };
    const ctx = {
      getHandler: () => ProtectedStub,
      getClass: () => ProtectedStub,
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;
    expect(() => new ApiKeyGuard(new Reflector()).canActivate(ctx)).toThrow();
    expect(request[PRINCIPAL_KEY]).toBeUndefined();
  });
});
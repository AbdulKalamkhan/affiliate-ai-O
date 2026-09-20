import { Reflector } from "@nestjs/core";
import { ApiKeyGuard } from "./api-key.guard";
import { Public } from "./public.decorator";

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
});
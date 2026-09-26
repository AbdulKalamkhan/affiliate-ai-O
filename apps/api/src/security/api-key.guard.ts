import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { IS_PUBLIC_KEY } from "./public.decorator";
import { ANONYMOUS_PRINCIPAL, API_KEY_PRINCIPAL, PRINCIPAL_KEY } from "./principal";

const readKey = (): string => {
  const key = process.env.API_KEY;
  if (!key || key.length === 0) {
    throw new UnauthorizedException("API key is not configured on the server");
  }
  return key;
};

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context
      .switchToHttp()
      .getRequest<Record<string, unknown> & { headers: Record<string, string | undefined> }>();
    if (isPublic) {
      // Public routes still get an explicit anonymous principal so audit code can
      // never fall back to guessing a caller.
      request[PRINCIPAL_KEY] = ANONYMOUS_PRINCIPAL;
      return true;
    }

    const expected = readKey();
    const header = request.headers["authorization"] ?? request.headers.Authorization ?? "";
    const matches = /^Bearer\s+(.+)$/i.exec(header);
    const provided = matches?.[1] ?? "";
    if (!timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException("Invalid or missing API key");
    }
    // The credential was verified; attach WHO the audit trail should name.
    request[PRINCIPAL_KEY] = API_KEY_PRINCIPAL;
    return true;
  }
}
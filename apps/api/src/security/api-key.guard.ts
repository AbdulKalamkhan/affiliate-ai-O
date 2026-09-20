import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { IS_PUBLIC_KEY } from "./public.decorator";

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
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const expected = readKey();
    const header = request.headers["authorization"] ?? request.headers.Authorization ?? "";
    const matches = /^Bearer\s+(.+)$/i.exec(header);
    const provided = matches?.[1] ?? "";
    if (!timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException("Invalid or missing API key");
    }
    return true;
  }
}
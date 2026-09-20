import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";

const WINDOW_MS = 60_000;
const PUBLIC_LIMIT = 60;
const MUTATED_LIMIT = 10;

interface WindowState {
  count: number;
  resetAt: number;
}

const WINDOWS = new Map<string, WindowState>();

const readIp = (request: { ip?: string; headers: Record<string, string | string[] | undefined> }): string => {
  const forwarded = request.headers["x-forwarded-for"];
  if (Array.isArray(forwarded)) return forwarded[0] ?? request.ip ?? "unknown";
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim() || request.ip || "unknown";
  }
  return request.ip ?? "unknown";
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ method: string; ip?: string; headers: Record<string, string | string[] | undefined> }>();
    const stateKey = `${request.method}:${readIp(request)}`;
    const limit = request.method === "GET" || request.method === "HEAD" ? PUBLIC_LIMIT : MUTATED_LIMIT;
    const now = Date.now();
    const current = WINDOWS.get(stateKey);

    if (!current || now >= current.resetAt) {
      WINDOWS.set(stateKey, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }

    current.count += 1;
    if (current.count > limit) {
      throw new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  mixin,
  Type,
} from "@nestjs/common";
import type { AuthedRequest } from "../auth/jwt-auth.guard";

// Sliding-window in-memory bucket. Single-process only; if/when we scale to
// multiple API instances, swap for Redis. For MVP one node is fine.
const buckets = new Map<string, number[]>();

/**
 * Returns true if the action is allowed (and records it), false if the
 * caller is over the limit. Does not throw — callers decide how to react
 * (HTTP 429 in REST, custom ack in WS).
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  return true;
}

/**
 * Factory for a NestJS guard that rate-limits per authenticated user.
 * Must be used after JwtAuthGuard so `req.user.id` is populated.
 *
 * @example
 *   @UseGuards(JwtAuthGuard, RateLimitGuard("swipes", 30, 60_000))
 */
export function RateLimitGuard(
  scope: string,
  limit: number,
  windowMs: number,
): Type<CanActivate> {
  @Injectable()
  class MixinRateLimitGuard implements CanActivate {
    canActivate(ctx: ExecutionContext): boolean {
      const req = ctx.switchToHttp().getRequest<AuthedRequest>();
      const userId = req.user?.id;
      // No user → let the upstream JwtAuthGuard handle the auth failure.
      if (!userId) return true;
      const ok = checkRateLimit(`${scope}:${userId}`, limit, windowMs);
      if (!ok) {
        throw new HttpException(
          { message: "Too many requests", scope },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    }
  }
  return mixin(MixinRateLimitGuard);
}

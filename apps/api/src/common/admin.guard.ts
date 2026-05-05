import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { env } from "../env";

/**
 * Bearer-token guard for /admin/* endpoints. Token = env.ADMIN_TOKEN
 * (long random hex). Not tied to JWT or to any User row — admin is
 * out-of-band, intended for the operator opening /admin?token=... manually.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("admin: missing bearer token");
    }
    const token = header.slice("Bearer ".length).trim();
    if (token !== env.ADMIN_TOKEN) {
      throw new UnauthorizedException("admin: bad token");
    }
    return true;
  }
}

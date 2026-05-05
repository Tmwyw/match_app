import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { PrismaService } from "../prisma.service";

export type JwtPayload = { sub: string };

export type AuthedRequest = Request & { user: { id: string } };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("missing bearer token");
    }
    const token = header.slice("Bearer ".length).trim();
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
      if (!payload?.sub) throw new Error("no sub");
    } catch {
      throw new UnauthorizedException("invalid token");
    }

    // One DB hit per request to enforce ban/delete state. The alternative
    // (encoding state into the JWT) would let banned users keep working
    // until their 30-day token expires — unacceptable for a moderation tool.
    const status = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, deletedAt: true, bannedAt: true, banReason: true },
    });
    if (!status) {
      // Stale JWT pointing at a removed user — let UsersController return 401
      // for /me so the frontend re-auths; for everything else, treat as
      // unauthorized.
      throw new UnauthorizedException("user no longer exists");
    }
    if (status.deletedAt) {
      throw new ForbiddenException({
        code: "ACCOUNT_DELETED",
        message: "account deleted",
      });
    }
    if (status.bannedAt) {
      throw new ForbiddenException({
        code: "BANNED",
        message: "account banned",
        reason: status.banReason ?? null,
      });
    }

    req.user = { id: status.id };
    return true;
  }
}

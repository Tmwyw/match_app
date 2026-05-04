import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

export type JwtPayload = { sub: string };

export type AuthedRequest = Request & { user: { id: string } };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("missing bearer token");
    }
    const token = header.slice("Bearer ".length).trim();
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      if (!payload?.sub) throw new Error("no sub");
      req.user = { id: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException("invalid token");
    }
  }
}

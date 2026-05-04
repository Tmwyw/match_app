import { Controller, Get, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { MeResponse } from "@tg-app-meet/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { toPublicUser } from "../auth/public-user";
import { PrismaService } from "../prisma.service";

@Controller()
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() current: { id: string }): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: current.id } });
    // 401 (not 404): a valid JWT pointing at a deleted user is, semantically,
    // an unusable credential. Returning 401 lets the frontend's existing
    // 401-handling clear the stale token and re-auth via initData.
    if (!user) throw new UnauthorizedException("user no longer exists");
    return toPublicUser(user);
  }
}

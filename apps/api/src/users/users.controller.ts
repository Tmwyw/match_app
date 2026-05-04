import { Controller, Get, NotFoundException, UseGuards } from "@nestjs/common";
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
    if (!user) throw new NotFoundException("user gone");
    return toPublicUser(user);
  }
}

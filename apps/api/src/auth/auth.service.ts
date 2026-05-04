import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { AuthResponse } from "@tg-app-meet/shared";
import { env } from "../env";
import { PrismaService } from "../prisma.service";
import { toPublicUser } from "./public-user";
import { InitDataError, verifyInitData } from "./verify-init-data";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async authenticateWithInitData(initData: string): Promise<AuthResponse> {
    let tgUser;
    try {
      tgUser = verifyInitData(initData, env.BOT_TOKEN);
    } catch (e) {
      const reason = e instanceof InitDataError ? e.message : "invalid initData";
      throw new UnauthorizedException(reason);
    }

    const username = tgUser.username ?? null;
    const user = await this.prisma.user.upsert({
      where: { telegramId: BigInt(tgUser.id) },
      create: { telegramId: BigInt(tgUser.id), username },
      update: { username },
    });

    const token = await this.jwt.signAsync({ sub: user.id });
    return { token, user: toPublicUser(user) };
  }
}

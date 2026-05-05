import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
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
    const tgId = BigInt(tgUser.id);

    // Hard refusal for soft-deleted accounts: do not silently revive on
    // re-auth — that would leak old swipes/matches/messages back into a
    // freshly opened Mini App that the user thought was wiped.
    const existing = await this.prisma.user.findUnique({
      where: { telegramId: tgId },
    });
    if (existing?.deletedAt) {
      throw new ForbiddenException({
        code: "ACCOUNT_DELETED",
        message: "account deleted",
      });
    }
    if (existing?.bannedAt) {
      throw new ForbiddenException({
        code: "BANNED",
        message: "account banned",
        reason: existing.banReason ?? null,
      });
    }

    const user = await this.prisma.user.upsert({
      where: { telegramId: tgId },
      create: { telegramId: tgId, username },
      update: { username },
    });

    const token = await this.jwt.signAsync({ sub: user.id });
    return { token, user: toPublicUser(user) };
  }
}

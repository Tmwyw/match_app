import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import type { DiscoverResponse } from "@tg-app-meet/shared";
import { PrismaService } from "../prisma.service";
import { toPublicCard, type UserWithProfiles } from "../profiles/public-card";

@Injectable()
export class DiscoverService {
  constructor(private readonly prisma: PrismaService) {}

  async next(meId: string): Promise<DiscoverResponse> {
    const me = await this.prisma.user.findUnique({
      where: { id: meId },
      include: { buyerProfile: true, ownerProfile: true },
    });
    if (!me) throw new ConflictException("PROFILE_REQUIRED");
    if (!me.role) throw new ConflictException("PROFILE_REQUIRED");

    const targetRole: Role = me.role === "BUYER" ? "OWNER" : "BUYER";
    const compat = this.buildCompatFilter(me);
    if (!compat) throw new ConflictException("PROFILE_REQUIRED");

    const where: Prisma.UserWhereInput = {
      role: targetRole,
      id: { not: meId },
      receivedSwipes: { none: { fromId: meId } },
      ...compat,
    };

    const remaining = await this.prisma.user.count({ where });
    if (remaining === 0) {
      return { card: null, remaining: 0 };
    }

    const candidate = await this.prisma.user.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      include: { buyerProfile: true, ownerProfile: true },
    });
    if (!candidate) return { card: null, remaining: 0 };

    return { card: toPublicCard(candidate as UserWithProfiles), remaining };
  }

  private buildCompatFilter(me: UserWithProfiles): Prisma.UserWhereInput | null {
    if (me.role === "BUYER") {
      if (!me.buyerProfile) return null;
      return {
        ownerProfile: {
          isActive: true,
          vertical: { in: me.buyerProfile.verticals },
          geos: { hasSome: me.buyerProfile.geos },
        },
      };
    }
    if (me.role === "OWNER") {
      if (!me.ownerProfile) return null;
      return {
        buyerProfile: {
          isActive: true,
          verticals: { hasSome: [me.ownerProfile.vertical] },
          geos: { hasSome: me.ownerProfile.geos },
        },
      };
    }
    return null;
  }
}

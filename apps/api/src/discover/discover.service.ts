import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import type { DiscoverFilters, DiscoverResponse } from "@tg-app-meet/shared";
import { BlocksService } from "../blocks/blocks.service";
import { PrismaService } from "../prisma.service";
import { toPublicCard, type UserWithProfiles } from "../profiles/public-card";

@Injectable()
export class DiscoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
  ) {}

  async next(
    meId: string,
    filters: DiscoverFilters = { verticals: [], geos: [] },
  ): Promise<DiscoverResponse> {
    const me = await this.prisma.user.findUnique({
      where: { id: meId },
      include: { buyerProfile: true, ownerProfile: true },
    });
    if (!me) throw new ConflictException("PROFILE_REQUIRED");
    if (!me.role) throw new ConflictException("PROFILE_REQUIRED");

    const targetRole: Role = me.role === "BUYER" ? "OWNER" : "BUYER";
    const compat = this.buildCompatFilter(me, filters);
    if (!compat) throw new ConflictException("PROFILE_REQUIRED");

    const blockedIds = await this.blocks.relatedIds(meId);

    const where: Prisma.UserWhereInput = {
      role: targetRole,
      id: { notIn: [meId, ...blockedIds] },
      // Soft-deleted and banned users are invisible to discovery on both sides.
      deletedAt: null,
      bannedAt: null,
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

  /**
   * Build the where-clause that intersects my profile compatibility with
   * any user-supplied filters. Filters NARROW the result: a buyer's stored
   * verticals already gate which owners they can see; the filter further
   * restricts to a chosen subset.
   */
  private buildCompatFilter(
    me: UserWithProfiles,
    filters: DiscoverFilters,
  ): Prisma.UserWhereInput | null {
    if (me.role === "BUYER") {
      if (!me.buyerProfile) return null;
      const verticalPool = intersectOrAll(me.buyerProfile.verticals, filters.verticals);
      const geoPool = intersectOrAll(me.buyerProfile.geos, filters.geos);
      // Empty intersection = filter excludes everything I'd otherwise see.
      // Return a where that matches nothing rather than collapsing to no
      // filter at all (which would surprise the user).
      if (verticalPool.length === 0 || geoPool.length === 0) {
        return { id: { equals: "__never__" } };
      }
      return {
        ownerProfile: {
          isActive: true,
          vertical: { in: verticalPool },
          geos: { hasSome: geoPool },
        },
      };
    }
    if (me.role === "OWNER") {
      if (!me.ownerProfile) return null;
      // Owner has a single vertical — apply the filter only if it's
      // actually present in the chosen list (otherwise filter is moot).
      const myVerticalPool =
        filters.verticals.length === 0 || filters.verticals.includes(me.ownerProfile.vertical)
          ? [me.ownerProfile.vertical]
          : [];
      const geoPool = intersectOrAll(me.ownerProfile.geos, filters.geos);
      if (myVerticalPool.length === 0 || geoPool.length === 0) {
        return { id: { equals: "__never__" } };
      }
      return {
        buyerProfile: {
          isActive: true,
          verticals: { hasSome: myVerticalPool },
          geos: { hasSome: geoPool },
        },
      };
    }
    return null;
  }
}

/** If `narrowing` is empty, return `base` unchanged. Otherwise intersect. */
function intersectOrAll(base: string[], narrowing: string[]): string[] {
  if (narrowing.length === 0) return base;
  const set = new Set(base);
  return narrowing.filter((t) => set.has(t));
}

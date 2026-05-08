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
    excludeIds: string[] = [],
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
      // Skip self, blocked-related users, and any ids the FE has already
      // queued in its stacked deck (Tinder-style preload).
      id: { notIn: [meId, ...blockedIds, ...excludeIds] },
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
   * any user-supplied filters.
   *
   * Compat is GEO-first: an owner's geos must overlap mine (and vice
   * versa). Vertical is NOT a hard filter anymore — early-stage users
   * write free-form custom tags ("ХУЙНЯ", "ВЕРТИКАЛЬ_ОЙ_БЛЯТЬ") which
   * almost never string-match across two profiles, so a strict overlap
   * empties the deck. Vertical filtering is still available via the
   * FilterSheet (filters.verticals); when set, it narrows further.
   */
  private buildCompatFilter(
    me: UserWithProfiles,
    filters: DiscoverFilters,
  ): Prisma.UserWhereInput | null {
    if (me.role === "BUYER") {
      if (!me.buyerProfile) return null;
      const geoPool = intersectOrAll(me.buyerProfile.geos, filters.geos);
      if (geoPool.length === 0) {
        return { id: { equals: "__never__" } };
      }
      const ownerWhere: Prisma.OwnerProfileWhereInput = {
        isActive: true,
        geos: { hasSome: geoPool },
      };
      // Soft vertical filter — match against owner's trafficSources first
      // (closest analogue to buyer's verticals which are also traffic
      // channels). Industry verticals stay free for now.
      if (filters.verticals.length > 0) {
        ownerWhere.trafficSources = { hasSome: filters.verticals };
      }
      return { ownerProfile: ownerWhere };
    }
    if (me.role === "OWNER") {
      if (!me.ownerProfile) return null;
      const geoPool = intersectOrAll(me.ownerProfile.geos, filters.geos);
      if (geoPool.length === 0) {
        return { id: { equals: "__never__" } };
      }
      const buyerWhere: Prisma.BuyerProfileWhereInput = {
        isActive: true,
        geos: { hasSome: geoPool },
      };
      // Filter buyer's traffic sources (renamed from `verticals` in
      // Phase 7d.2) when the owner explicitly narrows by source.
      if (filters.verticals.length > 0) {
        buyerWhere.trafficSources = { hasSome: filters.verticals };
      }
      return { buyerProfile: buyerWhere };
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

import { Injectable } from "@nestjs/common";
import type { MatchesListResponse } from "@tg-app-meet/shared";
import { BlocksService } from "../blocks/blocks.service";
import { PrismaService } from "../prisma.service";
import { deletedPlugCard, toPublicCard } from "../profiles/public-card";

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
  ) {}

  async listMine(meId: string): Promise<MatchesListResponse> {
    const matches = await this.prisma.match.findMany({
      where: { OR: [{ userAId: meId }, { userBId: meId }] },
      orderBy: { createdAt: "desc" },
      include: {
        chat: { select: { id: true } },
        userA: { include: { buyerProfile: true, ownerProfile: true } },
        userB: { include: { buyerProfile: true, ownerProfile: true } },
      },
    });

    const blockedIds = new Set(await this.blocks.relatedIds(meId));

    return matches
      .filter((m) => m.chat) // skip matches missing a chat (shouldn't happen)
      .map((m) => ({ match: m, other: m.userAId === meId ? m.userB : m.userA }))
      // Hide if either side blocked the other or the partner was banned.
      // Deleted users stay visible with a plug card so chat history is reachable.
      .filter(({ other }) => !blockedIds.has(other.id) && !other.bannedAt)
      .map(({ match: m, other }) => ({
        matchId: m.id,
        chatId: m.chat!.id,
        createdAt: m.createdAt.toISOString(),
        other: other.deletedAt
          ? deletedPlugCard(other.id, other.role)
          : toPublicCard(other),
      }));
  }
}

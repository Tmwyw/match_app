import { Injectable } from "@nestjs/common";
import type { MatchesListResponse } from "@tg-app-meet/shared";
import { PrismaService } from "../prisma.service";
import { toPublicCard } from "../profiles/public-card";

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

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

    return matches
      .filter((m) => m.chat) // skip matches missing a chat (shouldn't happen)
      .map((m) => {
        const other = m.userAId === meId ? m.userB : m.userA;
        return {
          matchId: m.id,
          chatId: m.chat!.id,
          createdAt: m.createdAt.toISOString(),
          other: toPublicCard(other),
        };
      });
  }
}

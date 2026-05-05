import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { BlocksResponse } from "@tg-app-meet/shared";
import { PrismaService } from "../prisma.service";

@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) throw new BadRequestException("CANNOT_BLOCK_SELF");
    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException("USER_NOT_FOUND");
    await this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.block.deleteMany({
      where: { blockerId, blockedId },
    });
  }

  async list(blockerId: string): Promise<BlocksResponse> {
    const rows = await this.prisma.block.findMany({
      where: { blockerId },
      orderBy: { createdAt: "desc" },
      include: {
        blocked: { select: { id: true, anonId: true, role: true } },
      },
    });
    return rows.map((b) => ({
      userId: b.blocked.id,
      anonId: b.blocked.anonId,
      role: b.blocked.role,
      blockedAt: b.createdAt.toISOString(),
    }));
  }

  /**
   * True iff there is a block in EITHER direction between the two users.
   * Used by discover/swipes/chat to refuse interactions.
   */
  async existsBetween(a: string, b: string): Promise<boolean> {
    const hit = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { id: true },
    });
    return !!hit;
  }

  /**
   * IDs the current user has blocked OR been blocked by. Used to filter
   * lists (discover, matches) where pulling each candidate through
   * existsBetween would be N+1.
   */
  async relatedIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
      select: { blockerId: true, blockedId: true },
    });
    const ids = new Set<string>();
    for (const r of rows) {
      ids.add(r.blockerId === userId ? r.blockedId : r.blockerId);
    }
    return Array.from(ids);
  }
}

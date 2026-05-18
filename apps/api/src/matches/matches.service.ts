import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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

  async listMine(
    meId: string,
    opts: { archived: boolean } = { archived: false },
  ): Promise<MatchesListResponse> {
    // Pull each match together with its chat's most recent message + the
    // unread-incoming count so the FE renders Telegram-style rows (last
    // message preview + relative time + unread badge) without an N+1.
    //
    // _count.messages takes a filtered WHERE so we count ONLY messages
    // the partner sent that I haven't read yet (`senderId != me &&
    // readAt IS NULL`). My own outbound messages and already-read ones
    // don't contribute.
    //
    // We can't order in SQL by "MAX(lastMessageAt, createdAt) desc" via
    // Prisma — that's a synthetic expression. Instead we fetch all,
    // compute the sort key in JS post-filter. Match counts per user are
    // small (matches are a result of mutual swipes, not a feed) so the
    // JS sort is fine.
    const matches = await this.prisma.match.findMany({
      where: { OR: [{ userAId: meId }, { userBId: meId }] },
      include: {
        chat: {
          select: {
            id: true,
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                senderId: true,
                content: true,
                createdAt: true,
              },
            },
            _count: {
              select: {
                messages: {
                  where: { senderId: { not: meId }, readAt: null },
                },
              },
            },
          },
        },
        userA: { include: { buyerProfile: true, ownerProfile: true } },
        userB: { include: { buyerProfile: true, ownerProfile: true } },
      },
    });

    const blockedIds = new Set(await this.blocks.relatedIds(meId));

    return matches
      .filter((m) => m.chat) // skip matches missing a chat (shouldn't happen)
      .map((m) => ({
        match: m,
        other: m.userAId === meId ? m.userB : m.userA,
        amA: m.userAId === meId,
      }))
      // Hide if either side blocked the other or the partner was banned.
      // Deleted users stay visible with a plug card so chat history is reachable.
      .filter(({ other }) => !blockedIds.has(other.id) && !other.bannedAt)
      // Archive is per-user — filter on the side flag that belongs to me.
      .filter(({ match: m, amA }) =>
        opts.archived ? (amA ? m.archivedByA : m.archivedByB) : !(amA ? m.archivedByA : m.archivedByB),
      )
      .map(({ match: m, other }) => {
        const lastMessage = m.chat!.messages[0] ?? null;
        const lastMessageAt = lastMessage
          ? lastMessage.createdAt.toISOString()
          : null;
        const lastMessagePreview = lastMessage
          ? truncatePreview(lastMessage.content)
          : null;
        const lastMessageFromMe = lastMessage
          ? lastMessage.senderId === meId
          : false;
        const unreadCount = m.chat!._count.messages;
        // Sort key: last activity (last message time OR match creation
        // if nobody has written yet). This is what bumps recently-active
        // chats to the top of the list, Telegram-style.
        const lastActivityMs = lastMessage
          ? lastMessage.createdAt.getTime()
          : m.createdAt.getTime();
        return {
          row: {
            matchId: m.id,
            chatId: m.chat!.id,
            createdAt: m.createdAt.toISOString(),
            lastMessageAt,
            lastMessagePreview,
            lastMessageFromMe,
            unreadCount,
            other: other.deletedAt
              ? deletedPlugCard(other.id, other.role)
              : toPublicCard(other),
          },
          lastActivityMs,
        };
      })
      .sort((a, b) => b.lastActivityMs - a.lastActivityMs)
      .map(({ row }) => row);
  }

  async setArchived(
    meId: string,
    matchId: string,
    archived: boolean,
  ): Promise<void> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, userAId: true, userBId: true },
    });
    if (!match) throw new NotFoundException("MATCH_NOT_FOUND");
    if (match.userAId !== meId && match.userBId !== meId) {
      throw new ForbiddenException("FORBIDDEN");
    }
    const data =
      match.userAId === meId
        ? { archivedByA: archived }
        : { archivedByB: archived };
    await this.prisma.match.update({ where: { id: matchId }, data });
  }
}

/** Compact preview for the chat-list row — strips line breaks and clips
 *  to a Telegram-ish length. Anti-deanon has already run on the stored
 *  content so no further scrubbing here. */
function truncatePreview(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? flat.slice(0, 59).trimEnd() + "…" : flat;
}

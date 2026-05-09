import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SwipeAction as DbSwipeAction } from "@prisma/client";
import type { SwipeRequest, SwipeResponse } from "@tg-app-meet/shared";
import { BlocksService } from "../blocks/blocks.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma.service";

/** Undo window for the most recent swipe — 60 seconds, then it sticks. */
const UNDO_WINDOW_MS = 60_000;

// Internal-only: lets us tell apart "you matched right now" from
// "you re-swiped a person you'd already matched" so we only push DMs
// for the former (otherwise re-swiping floods both inboxes).
type SwipeOutcome = SwipeResponse & { justMatched: boolean };

@Injectable()
export class SwipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly blocks: BlocksService,
  ) {}

  async swipe(meId: string, body: SwipeRequest): Promise<SwipeResponse> {
    if (body.toUserId === meId) {
      throw new BadRequestException("CANNOT_SWIPE_SELF");
    }

    if (await this.blocks.existsBetween(meId, body.toUserId)) {
      throw new ForbiddenException("BLOCKED");
    }

    // Profile-moderation gate — both sides must be approved. Frontend
    // never lets a pending user reach the deck, but backend re-checks.
    const me = await this.prisma.user.findUnique({
      where: { id: meId },
      select: { profileApprovedAt: true },
    });
    if (!me || me.profileApprovedAt == null) {
      throw new ConflictException("PROFILE_PENDING");
    }

    const outcome = await this.prisma.$transaction<SwipeOutcome>((tx) =>
      this.runSwipe(tx, meId, body),
    );

    if (outcome.justMatched) {
      // Fire-and-forget: a Telegram API hiccup must not fail the swipe HTTP.
      void this.fireMatchNotifications(meId, body.toUserId);
    }

    const { justMatched: _ignored, ...response } = outcome;
    return response;
  }

  private async runSwipe(
    tx: Prisma.TransactionClient,
    meId: string,
    body: SwipeRequest,
  ): Promise<SwipeOutcome> {
    const recipient = await tx.user.findUnique({
      where: { id: body.toUserId },
      include: { buyerProfile: true, ownerProfile: true },
    });
    if (!recipient) throw new NotFoundException("recipient missing");
    if (!recipient.role) throw new NotFoundException("recipient has no role");
    if (recipient.deletedAt || recipient.bannedAt) {
      throw new NotFoundException("recipient unavailable");
    }
    if (recipient.profileApprovedAt == null) {
      // Pending profiles aren't visible in discover — but they could be
      // reached via stale FE state or deep-link race. Reject the swipe.
      throw new NotFoundException("recipient unavailable");
    }
    const hasProfile =
      (recipient.role === "BUYER" && recipient.buyerProfile) ||
      (recipient.role === "OWNER" && recipient.ownerProfile);
    if (!hasProfile) throw new NotFoundException("recipient has no profile");

    const existing = await tx.swipe.findUnique({
      where: { fromId_toId: { fromId: meId, toId: body.toUserId } },
    });
    if (existing) {
      const state = await matchedStateFor(tx, meId, body.toUserId, existing.action);
      return { ...state, justMatched: false };
    }

    await tx.swipe.create({
      data: {
        fromId: meId,
        toId: body.toUserId,
        action: body.action as DbSwipeAction,
      },
    });

    if (body.action !== "LIKE") {
      return { matched: false, matchId: null, chatId: null, justMatched: false };
    }

    const reciprocal = await tx.swipe.findUnique({
      where: { fromId_toId: { fromId: body.toUserId, toId: meId } },
    });
    if (!reciprocal || reciprocal.action !== "LIKE") {
      return { matched: false, matchId: null, chatId: null, justMatched: false };
    }

    const created = await ensureMatch(tx, meId, body.toUserId);
    return { ...created, justMatched: true };
  }

  /**
   * How many people LIKE'd the current user without (yet) a reciprocal
   * swipe of any kind. Used by the "💜 N человек тебя лайкнули" badge —
   * we deliberately don't expose WHO so we have a paid-reveal hook later.
   */
  async inboundLikesCount(meId: string): Promise<number> {
    // LIKE-swipes pointed at me where I haven't swiped the sender BACK in
    // either direction yet. Once I respond, the candidate either turns into
    // a Match (counted via /matches) or vanishes via SKIP, so they're no
    // longer "pending interest".
    return this.prisma.swipe.count({
      where: {
        toId: meId,
        action: "LIKE",
        NOT: {
          from: { receivedSwipes: { some: { fromId: meId } } },
        },
      },
    });
  }

  /**
   * Erase the user's most recent swipe if it's still within the undo
   * window. Refuses if the swipe already produced a Match — undoing then
   * would orphan a real conversation.
   */
  async undoLast(meId: string): Promise<void> {
    const last = await this.prisma.swipe.findFirst({
      where: { fromId: meId },
      orderBy: { createdAt: "desc" },
    });
    if (!last) throw new NotFoundException("NO_SWIPE");
    if (Date.now() - last.createdAt.getTime() > UNDO_WINDOW_MS) {
      throw new NotFoundException("UNDO_WINDOW_EXPIRED");
    }

    if (last.action === "LIKE") {
      const [userAId, userBId] = sortPair(meId, last.toId);
      const match = await this.prisma.match.findUnique({
        where: { userAId_userBId: { userAId, userBId } },
      });
      if (match) {
        // Match already exists — refuse rather than delete it. The chat
        // may already have messages and the partner might have engaged.
        throw new ConflictException("MATCH_EXISTS");
      }
    }
    await this.prisma.swipe.delete({ where: { id: last.id } });
  }

  /**
   * Wipe all of the current user's swipes that didn't produce a match.
   * The matched ones stay (deleting them would orphan an active chat
   * and let the same pair re-discover each other endlessly). Everyone
   * the user previously skipped or solo-liked-without-match returns to
   * the discover deck on the next /discover call.
   */
  async resetSwipes(meId: string): Promise<{ removed: number }> {
    const matches = await this.prisma.match.findMany({
      where: { OR: [{ userAId: meId }, { userBId: meId }] },
      select: { userAId: true, userBId: true },
    });
    const matchedPartnerIds = matches
      .flatMap((m) => [m.userAId, m.userBId])
      .filter((id) => id !== meId);

    const result = await this.prisma.swipe.deleteMany({
      where: {
        fromId: meId,
        ...(matchedPartnerIds.length > 0
          ? { toId: { notIn: matchedPartnerIds } }
          : {}),
      },
    });
    return { removed: result.count };
  }

  private async fireMatchNotifications(meId: string, otherId: string): Promise<void> {
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: [meId, otherId] } },
        select: { id: true, anonId: true, displayName: true },
      });
      const me = users.find((u) => u.id === meId);
      const other = users.find((u) => u.id === otherId);
      if (!me?.anonId || !other?.anonId) return;
      await Promise.all([
        this.notifications.notifyMatch(meId, other.displayName ?? other.anonId),
        this.notifications.notifyMatch(otherId, me.displayName ?? me.anonId),
      ]);
    } catch {
      // Notifications service already logs; swallow here so Phase-6 plumbing
      // can never break Phase-3 swipe behaviour.
    }
  }
}

function sortPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function ensureMatch(
  tx: Prisma.TransactionClient,
  aId: string,
  bId: string,
): Promise<SwipeResponse> {
  const [userAId, userBId] = sortPair(aId, bId);
  const match = await tx.match.upsert({
    where: { userAId_userBId: { userAId, userBId } },
    create: { userAId, userBId },
    update: {},
  });
  const chat = await tx.chat.upsert({
    where: { matchId: match.id },
    create: { matchId: match.id },
    update: {},
  });
  return { matched: true, matchId: match.id, chatId: chat.id };
}

async function matchedStateFor(
  tx: Prisma.TransactionClient,
  meId: string,
  otherId: string,
  existingAction: DbSwipeAction,
): Promise<SwipeResponse> {
  if (existingAction !== "LIKE") {
    return { matched: false, matchId: null, chatId: null };
  }
  const [userAId, userBId] = sortPair(meId, otherId);
  const match = await tx.match.findUnique({
    where: { userAId_userBId: { userAId, userBId } },
    include: { chat: { select: { id: true } } },
  });
  if (!match) return { matched: false, matchId: null, chatId: null };
  return { matched: true, matchId: match.id, chatId: match.chat?.id ?? null };
}

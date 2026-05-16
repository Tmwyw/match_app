import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SwipeAction as DbSwipeAction } from "@prisma/client";
import type { SwipeRequest, SwipeResponse } from "@tg-app-meet/shared";
import { BlocksService } from "../blocks/blocks.service";
import { ChatGateway } from "../chat/chat.gateway";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma.service";

/** Undo window for the most recent swipe — 60 seconds, then it sticks. */
const UNDO_WINDOW_MS = 60_000;

// Internal-only: lets us tell apart fresh outcomes from idempotent
// re-swipes so we only fire notifications/WS events the first time.
type SwipeOutcome = SwipeResponse & {
  justMatched: boolean;
  /** True when this swipe was a brand-new LIKE that didn't (yet)
   *  produce a mutual match. Used to fire the inbound-like push +
   *  WS badge bump on the recipient. */
  freshInboundLike: boolean;
};

@Injectable()
export class SwipesService {
  private readonly logger = new Logger(SwipesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly blocks: BlocksService,
    private readonly gateway: ChatGateway,
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
      this.logger.log(
        `swipe → just matched: ${meId} ↔ ${body.toUserId} (matchId=${outcome.matchId})`,
      );
      // Fire-and-forget: a Telegram API hiccup must not fail the swipe HTTP.
      void this.fireMatchNotifications(meId, body.toUserId);
    } else if (outcome.freshInboundLike) {
      this.logger.log(
        `swipe → fresh inbound LIKE: ${meId} → ${body.toUserId}`,
      );
      // WS badge bump (instant) + Telegram push (background-safe).
      try {
        this.gateway.emitLikesIncoming(body.toUserId);
      } catch {
        /* WS hiccup must never fail the swipe */
      }
      void this.notifications
        .notifyInboundLike(body.toUserId)
        .catch(() => {
          /* notifications service already logs */
        });
    } else if (outcome.matched) {
      this.logger.debug(
        `swipe → already matched (no fan-out): ${meId} ↔ ${body.toUserId}`,
      );
    }

    const { justMatched: _jm, freshInboundLike: _fil, ...response } = outcome;
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
      // SKIP → LIKE: user changed their mind. Tear down the old SKIP and
      // fall through to the normal LIKE-create path so the recipient
      // gets a fresh inbound-like push exactly as if this were the very
      // first swipe. The "first impression" the recipient gets is the
      // LIKE — they were never told about the SKIP because skips don't
      // emit anything.
      //
      // Same-action re-swipe (LIKE→LIKE / SKIP→SKIP) and the LIKE→SKIP
      // demotion stay as before: silent no-op returning the current
      // state. LIKE→SKIP is unsupported on purpose — once a LIKE has
      // gone out the recipient may have already seen the inbound-like
      // badge / push, and retracting it silently would be misleading.
      // For genuine "tap-wrong, undo" cases there's DELETE /swipes/last
      // within the 60s undo window.
      const isUpgrade =
        existing.action === "SKIP" && body.action === "LIKE";
      if (!isUpgrade) {
        const state = await matchedStateFor(
          tx,
          meId,
          body.toUserId,
          existing.action,
        );
        return { ...state, justMatched: false, freshInboundLike: false };
      }
      await tx.swipe.delete({
        where: { fromId_toId: { fromId: meId, toId: body.toUserId } },
      });
      // fall through to the create + match-check path below
    }

    await tx.swipe.create({
      data: {
        fromId: meId,
        toId: body.toUserId,
        action: body.action as DbSwipeAction,
      },
    });

    if (body.action !== "LIKE") {
      return {
        matched: false,
        matchId: null,
        chatId: null,
        justMatched: false,
        freshInboundLike: false,
      };
    }

    const reciprocal = await tx.swipe.findUnique({
      where: { fromId_toId: { fromId: body.toUserId, toId: meId } },
    });
    if (!reciprocal || reciprocal.action !== "LIKE") {
      // First-time LIKE without reciprocal → recipient gets the
      // inbound-like ping (handled outside the transaction in `swipe`).
      return {
        matched: false,
        matchId: null,
        chatId: null,
        justMatched: false,
        freshInboundLike: true,
      };
    }

    const created = await ensureMatch(tx, meId, body.toUserId);
    return { ...created, justMatched: true, freshInboundLike: false };
  }

  /**
   * Does `otherId` have a pending LIKE pointed at `meId`? Used by the
   * deep-link card viewer to set the `likedYou` flag on PublicCard so
   * the FE can paint the "Лайкнул(а) вас" badge.
   */
  async hasInboundLike(meId: string, otherId: string): Promise<boolean> {
    const swipe = await this.prisma.swipe.findUnique({
      where: { fromId_toId: { fromId: otherId, toId: meId } },
      select: { action: true },
    });
    return swipe?.action === "LIKE";
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
      this.logger.log(`match push fan-out: ${meId} ↔ ${otherId}`);
      const users = await this.prisma.user.findMany({
        where: { id: { in: [meId, otherId] } },
        select: { id: true, anonId: true, displayName: true },
      });
      const me = users.find((u) => u.id === meId);
      const other = users.find((u) => u.id === otherId);
      if (!me?.anonId || !other?.anonId) {
        this.logger.warn(
          `match push aborted — missing anonId. me=${me?.anonId} other=${other?.anonId}`,
        );
        return;
      }
      await Promise.all([
        this.notifications.notifyMatch(meId, other.displayName ?? other.anonId),
        this.notifications.notifyMatch(otherId, me.displayName ?? me.anonId),
      ]);
      this.logger.log(`match push fan-out done: ${meId} ↔ ${otherId}`);
    } catch (e) {
      // Notifications service already logs network-level errors; this branch
      // is for the unexpected (DB hiccup, prisma throw). Surface so we can
      // tell apart "Telegram blocked" vs "we never tried".
      this.logger.error(
        `match push fan-out failed: ${e instanceof Error ? e.message : String(e)}`,
      );
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

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SwipeAction as DbSwipeAction } from "@prisma/client";
import type { SwipeRequest, SwipeResponse } from "@tg-app-meet/shared";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma.service";

// Internal-only: lets us tell apart "you matched right now" from
// "you re-swiped a person you'd already matched" so we only push DMs
// for the former (otherwise re-swiping floods both inboxes).
type SwipeOutcome = SwipeResponse & { justMatched: boolean };

@Injectable()
export class SwipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async swipe(meId: string, body: SwipeRequest): Promise<SwipeResponse> {
    if (body.toUserId === meId) {
      throw new BadRequestException("CANNOT_SWIPE_SELF");
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

  private async fireMatchNotifications(meId: string, otherId: string): Promise<void> {
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: [meId, otherId] } },
        select: { id: true, anonId: true },
      });
      const me = users.find((u) => u.id === meId);
      const other = users.find((u) => u.id === otherId);
      if (!me?.anonId || !other?.anonId) return;
      await Promise.all([
        this.notifications.notifyMatch(meId, other.anonId),
        this.notifications.notifyMatch(otherId, me.anonId),
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

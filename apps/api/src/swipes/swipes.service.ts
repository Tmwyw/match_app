import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SwipeAction as DbSwipeAction } from "@prisma/client";
import type { SwipeRequest, SwipeResponse } from "@tg-app-meet/shared";
import { PrismaService } from "../prisma.service";

@Injectable()
export class SwipesService {
  constructor(private readonly prisma: PrismaService) {}

  async swipe(meId: string, body: SwipeRequest): Promise<SwipeResponse> {
    if (body.toUserId === meId) {
      throw new BadRequestException("CANNOT_SWIPE_SELF");
    }

    return this.prisma.$transaction(async (tx) => {
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
        return matchedStateFor(tx, meId, body.toUserId, existing.action);
      }

      await tx.swipe.create({
        data: {
          fromId: meId,
          toId: body.toUserId,
          action: body.action as DbSwipeAction,
        },
      });

      if (body.action !== "LIKE") {
        return { matched: false, matchId: null, chatId: null };
      }

      const reciprocal = await tx.swipe.findUnique({
        where: { fromId_toId: { fromId: body.toUserId, toId: meId } },
      });
      if (!reciprocal || reciprocal.action !== "LIKE") {
        return { matched: false, matchId: null, chatId: null };
      }

      return ensureMatch(tx, meId, body.toUserId);
    });
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

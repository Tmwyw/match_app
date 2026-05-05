import { Injectable, NotFoundException } from "@nestjs/common";
import type { RevealStatus } from "@tg-app-meet/shared";
import { ChatGateway } from "../chat/chat.gateway";
import { ChatService } from "../chat/chat.service";
import { PrismaService } from "../prisma.service";

type ChatParticipants = {
  userAId: string;
  userBId: string;
  userAUsername: string | null;
  userBUsername: string | null;
};

@Injectable()
export class RevealService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
  ) {}

  async getStatus(userId: string, chatId: string): Promise<RevealStatus> {
    await this.chat.assertParticipant(userId, chatId);
    const participants = await this.loadParticipants(chatId);
    const reveals = await this.loadAcceptedIds(chatId);
    return this.buildStatus(userId, participants, reveals);
  }

  async accept(userId: string, chatId: string): Promise<RevealStatus> {
    await this.chat.assertParticipant(userId, chatId);

    // Idempotent: re-accepting just returns the existing record. Unique on
    // (chatId, userId) prevents duplicates in the DB.
    await this.prisma.contactReveal.upsert({
      where: { chatId_userId: { chatId, userId } },
      create: { chatId, userId },
      update: {},
    });

    const participants = await this.loadParticipants(chatId);
    const reveals = await this.loadAcceptedIds(chatId);

    const otherId =
      participants.userAId === userId ? participants.userBId : participants.userAId;

    const myStatus = this.buildStatus(userId, participants, reveals);
    const otherStatus = this.buildStatus(otherId, participants, reveals);

    // Push to both user-rooms so each side's UI updates regardless of which
    // chat is currently open.
    this.gateway.emitRevealUpdated(userId, myStatus);
    this.gateway.emitRevealUpdated(otherId, otherStatus);

    return myStatus;
  }

  private async loadParticipants(chatId: string): Promise<ChatParticipants> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        match: {
          include: {
            userA: { select: { id: true, username: true } },
            userB: { select: { id: true, username: true } },
          },
        },
      },
    });
    if (!chat) throw new NotFoundException("CHAT_NOT_FOUND");
    return {
      userAId: chat.match.userA.id,
      userBId: chat.match.userB.id,
      userAUsername: chat.match.userA.username,
      userBUsername: chat.match.userB.username,
    };
  }

  private async loadAcceptedIds(chatId: string): Promise<Set<string>> {
    const rows = await this.prisma.contactReveal.findMany({
      where: { chatId },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }

  private buildStatus(
    userId: string,
    participants: ChatParticipants,
    accepted: Set<string>,
  ): RevealStatus {
    const otherId =
      participants.userAId === userId ? participants.userBId : participants.userAId;
    const otherUsername =
      participants.userAId === userId
        ? participants.userBUsername
        : participants.userAUsername;

    const meAccepted = accepted.has(userId);
    const otherAccepted = accepted.has(otherId);

    return {
      meAccepted,
      otherAccepted,
      otherUsername: meAccepted && otherAccepted ? otherUsername : null,
    };
  }
}

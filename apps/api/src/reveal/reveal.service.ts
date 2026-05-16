import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { RevealStatus } from "@tg-app-meet/shared";
import { ChatGateway } from "../chat/chat.gateway";
import { ChatService } from "../chat/chat.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma.service";

type ChatParticipants = {
  userAId: string;
  userBId: string;
  userAUsername: string | null;
  userBUsername: string | null;
};

@Injectable()
export class RevealService {
  private readonly logger = new Logger(RevealService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
    private readonly notifications: NotificationsService,
  ) {}

  async getStatus(userId: string, chatId: string): Promise<RevealStatus> {
    await this.chat.assertParticipant(userId, chatId);
    const participants = await this.loadParticipants(chatId);
    const reveals = await this.loadAcceptedIds(chatId);
    return this.buildStatus(userId, participants, reveals);
  }

  async accept(userId: string, chatId: string): Promise<RevealStatus> {
    await this.chat.assertParticipant(userId, chatId);

    // Snapshot accepted set BEFORE upsert so we can diff post-upsert and
    // detect the moment the chat transitions one-sided → fully unlocked.
    // The diff approach (vs. a simple "was the OTHER already accepted?"
    // pre-check) handles the rare double-accept race: if both users call
    // accept simultaneously, both will see "both before = false" and
    // "both after = true" and both will fire the transition push, which
    // means each side gets the mention DM once. Worst case is a duplicate
    // DM in that race window — better than missing the push entirely.
    const beforeAccepted = await this.loadAcceptedIds(chatId);

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

    // Transition detection: did this accept just flip the contact from
    // half-locked to fully open? If yes, fire a bot DM to each side with
    // an HTML mention of their counterpart, so even username-less users
    // can reach each other (tap the mention → Telegram opens that chat).
    const bothBefore =
      beforeAccepted.has(participants.userAId) &&
      beforeAccepted.has(participants.userBId);
    const bothAfter =
      reveals.has(participants.userAId) && reveals.has(participants.userBId);
    if (!bothBefore && bothAfter) {
      this.logger.log(
        `reveal transition unlocked chat=${chatId} (${userId} ↔ ${otherId})`,
      );
      // Fire-and-forget per direction — both users get a mention of
      // the OTHER party in their own DM with the bot.
      void this.notifications
        .notifyRevealUnlocked(userId, otherId, chatId)
        .catch((e) =>
          this.logger.warn(
            `notifyRevealUnlocked failed for ${userId}: ${e instanceof Error ? e.message : e}`,
          ),
        );
      void this.notifications
        .notifyRevealUnlocked(otherId, userId, chatId)
        .catch((e) =>
          this.logger.warn(
            `notifyRevealUnlocked failed for ${otherId}: ${e instanceof Error ? e.message : e}`,
          ),
        );
    }

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

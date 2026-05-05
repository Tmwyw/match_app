import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Message } from "@prisma/client";
import type {
  ChatHistoryResponse,
  ChatMessage,
  EditMessageInput,
  PresenceResponse,
  SendMessageInput,
  SendMessageResult,
} from "@tg-app-meet/shared";
import { BlocksService } from "../blocks/blocks.service";
import { PrismaService } from "../prisma.service";
import { antiDeanon } from "./anti-deanon";

const HISTORY_LIMIT_MAX = 100;
const HISTORY_LIMIT_DEFAULT = 50;
/** A user can only edit a message within this window after sending it. */
const EDIT_WINDOW_MS = 15 * 60 * 1000;

/** Internal — extends the public ack with the recipient id so the gateway
 *  can route a DM push without a second DB round-trip. Never sent to clients. */
export type SendMessageInternal = SendMessageResult & { recipientId: string };

/** Internal — payload the gateway broadcasts after a successful edit. */
export type EditMessageInternal = SendMessageResult;

/** Internal — payload the gateway emits to the chat room after marking-read. */
export type MarkReadInternal = {
  chatId: string;
  messageIds: string[];
  readAt: string;
};

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
  ) {}

  async isParticipant(userId: string, chatId: string): Promise<boolean> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { match: true },
    });
    if (!chat) return false;
    if (chat.match.userAId !== userId && chat.match.userBId !== userId) {
      return false;
    }
    const otherId =
      chat.match.userAId === userId ? chat.match.userBId : chat.match.userAId;
    // Block in either direction = no realtime ops. Historical messages stay
    // in the DB; an unblock can restore the conversation later.
    if (await this.blocks.existsBetween(userId, otherId)) return false;
    return true;
  }

  /**
   * Throws ForbiddenException if user is not in the chat. Use in
   * controllers/services that need access control without the boolean dance.
   * Distinguishes 404 (chat doesn't exist) from 403 (chat exists, not yours).
   */
  async assertParticipant(userId: string, chatId: string): Promise<void> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { match: true },
    });
    if (!chat) throw new NotFoundException("CHAT_NOT_FOUND");
    if (chat.match.userAId !== userId && chat.match.userBId !== userId) {
      throw new ForbiddenException("FORBIDDEN");
    }
    const otherId =
      chat.match.userAId === userId ? chat.match.userBId : chat.match.userAId;
    if (await this.blocks.existsBetween(userId, otherId)) {
      throw new ForbiddenException("BLOCKED");
    }
  }

  /**
   * IDs of users who share at least one match with `userId`. Used by the
   * gateway to fan out presence pings only to people who'd actually care.
   */
  async getPartnerIds(userId: string): Promise<string[]> {
    const matches = await this.prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    });
    const ids = new Set<string>();
    for (const m of matches) {
      ids.add(m.userAId === userId ? m.userBId : m.userAId);
    }
    return Array.from(ids);
  }

  /** Throws if `meId` and `otherId` don't share at least one match. Used by
   *  the presence REST endpoint so we don't leak online status to strangers. */
  async assertSharedChat(meId: string, otherId: string): Promise<void> {
    if (meId === otherId) return; // querying yourself is fine
    const exists = await this.prisma.match.findFirst({
      where: {
        OR: [
          { userAId: meId, userBId: otherId },
          { userAId: otherId, userBId: meId },
        ],
      },
      select: { id: true },
    });
    if (!exists) throw new ForbiddenException("FORBIDDEN");
  }

  async getPresence(userId: string): Promise<PresenceResponse> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lastSeenAt: true },
    });
    return {
      online: false, // gateway-side fact; REST callers patch this in via gateway.isOnline()
      lastSeen: u?.lastSeenAt?.toISOString() ?? null,
    };
  }

  async sendMessage(
    senderId: string,
    input: SendMessageInput,
  ): Promise<SendMessageInternal> {
    // Single fetch covers participant check AND lets us return the recipient
    // id to the gateway so it can decide whether to push a DM notification.
    const chat = await this.prisma.chat.findUnique({
      where: { id: input.chatId },
      include: { match: true },
    });
    if (!chat) throw new NotFoundException("CHAT_NOT_FOUND");
    if (chat.match.userAId !== senderId && chat.match.userBId !== senderId) {
      throw new ForbiddenException("FORBIDDEN");
    }
    const recipientId =
      chat.match.userAId === senderId ? chat.match.userBId : chat.match.userAId;
    if (await this.blocks.existsBetween(senderId, recipientId)) {
      throw new ForbiddenException("BLOCKED");
    }

    const { content, filtered } = antiDeanon(input.content);
    // If everything was scrubbed, store a single placeholder so the recipient
    // still sees that the sender attempted to write something.
    const finalContent = content.length > 0 ? content : "[скрыто]";

    const row = await this.prisma.message.create({
      data: { chatId: input.chatId, senderId, content: finalContent },
      include: { sender: { select: { anonId: true } } },
    });

    return {
      message: rowToChatMessage(row),
      filtered,
      recipientId,
    };
  }

  async editMessage(
    userId: string,
    input: EditMessageInput,
  ): Promise<EditMessageInternal> {
    await this.assertParticipant(userId, input.chatId);
    const target = await this.prisma.message.findUnique({
      where: { id: input.messageId },
    });
    if (!target || target.chatId !== input.chatId) {
      throw new NotFoundException("MESSAGE_NOT_FOUND");
    }
    if (target.senderId !== userId) {
      throw new ForbiddenException("NOT_YOUR_MESSAGE");
    }
    if (Date.now() - target.createdAt.getTime() > EDIT_WINDOW_MS) {
      // Use 410 GONE so the client distinguishes "too old" from "missing".
      throw new GoneException("EDIT_WINDOW_EXPIRED");
    }

    const { content, filtered } = antiDeanon(input.content);
    const finalContent = content.length > 0 ? content : "[скрыто]";

    const row = await this.prisma.message.update({
      where: { id: input.messageId },
      data: { content: finalContent, editedAt: new Date() },
      include: { sender: { select: { anonId: true } } },
    });

    return { message: rowToChatMessage(row), filtered };
  }

  /**
   * Mark every unread INBOUND message in the chat with `createdAt` <= the
   * target message's `createdAt` as read. Returns the touched ids and the
   * shared timestamp so the gateway can broadcast a single batched event.
   *
   * Idempotent: re-running with an already-read marker returns
   * `{ messageIds: [] }` and no side effects.
   */
  async markRead(
    readerId: string,
    chatId: string,
    messageId: string,
  ): Promise<MarkReadInternal | null> {
    await this.assertParticipant(readerId, chatId);
    const target = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, chatId: true, createdAt: true },
    });
    if (!target || target.chatId !== chatId) {
      throw new NotFoundException("MESSAGE_NOT_FOUND");
    }

    const candidates = await this.prisma.message.findMany({
      where: {
        chatId,
        senderId: { not: readerId },
        readAt: null,
        createdAt: { lte: target.createdAt },
      },
      select: { id: true },
    });
    if (candidates.length === 0) return null;

    const readAt = new Date();
    await this.prisma.message.updateMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      data: { readAt },
    });
    return {
      chatId,
      messageIds: candidates.map((c) => c.id),
      readAt: readAt.toISOString(),
    };
  }

  async getHistory(
    userId: string,
    chatId: string,
    opts: { before?: Date; after?: Date; limit: number },
  ): Promise<ChatHistoryResponse> {
    const exists = await this.prisma.chat.findUnique({ where: { id: chatId } });
    if (!exists) throw new NotFoundException("CHAT_NOT_FOUND");
    if (!(await this.isParticipant(userId, chatId))) {
      throw new ForbiddenException("FORBIDDEN");
    }

    // Resync mode: caller already has the chat open and just reconnected.
    // Return everything strictly newer than `after`, ASC, no pagination
    // needed — only outage windows produce backlog and they're small.
    if (opts.after) {
      const rows = await this.prisma.message.findMany({
        where: { chatId, createdAt: { gt: opts.after } },
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { anonId: true } } },
      });
      return { messages: rows.map(rowToChatMessage), hasMore: false };
    }

    const take = Math.min(
      Math.max(opts.limit | 0 || HISTORY_LIMIT_DEFAULT, 1),
      HISTORY_LIMIT_MAX,
    );

    const rows = await this.prisma.message.findMany({
      where: {
        chatId,
        ...(opts.before ? { createdAt: { lt: opts.before } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      include: { sender: { select: { anonId: true } } },
    });

    const hasMore = rows.length > take;
    const slice = hasMore ? rows.slice(0, take) : rows;
    const messages: ChatMessage[] = slice.slice().reverse().map(rowToChatMessage);

    return { messages, hasMore };
  }
}

type RowWithSender = Message & { sender: { anonId: string | null } };

function rowToChatMessage(m: RowWithSender): ChatMessage {
  return {
    id: m.id,
    chatId: m.chatId,
    senderId: m.senderId,
    senderAnonId: m.sender.anonId ?? "?",
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    readAt: m.readAt?.toISOString() ?? null,
  };
}

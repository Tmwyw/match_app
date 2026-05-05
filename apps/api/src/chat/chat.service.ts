import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ChatHistoryResponse,
  ChatMessage,
  SendMessageInput,
  SendMessageResult,
} from "@tg-app-meet/shared";
import { PrismaService } from "../prisma.service";
import { antiDeanon } from "./anti-deanon";

const HISTORY_LIMIT_MAX = 100;
const HISTORY_LIMIT_DEFAULT = 50;

/** Internal — extends the public ack with the recipient id so the gateway
 *  can route a DM push without a second DB round-trip. Never sent to clients. */
export type SendMessageInternal = SendMessageResult & { recipientId: string };

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async isParticipant(userId: string, chatId: string): Promise<boolean> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { match: true },
    });
    if (!chat) return false;
    return chat.match.userAId === userId || chat.match.userBId === userId;
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

    const { content, filtered } = antiDeanon(input.content);
    // If everything was scrubbed, store a single placeholder so the recipient
    // still sees that the sender attempted to write something.
    const finalContent = content.length > 0 ? content : "[скрыто]";

    const row = await this.prisma.message.create({
      data: { chatId: input.chatId, senderId, content: finalContent },
      include: { sender: { select: { anonId: true } } },
    });

    const message: ChatMessage = {
      id: row.id,
      chatId: row.chatId,
      senderId: row.senderId,
      senderAnonId: row.sender.anonId ?? "?",
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    };
    return { message, filtered, recipientId };
  }

  async getHistory(
    userId: string,
    chatId: string,
    before: Date | undefined,
    limit: number,
  ): Promise<ChatHistoryResponse> {
    const exists = await this.prisma.chat.findUnique({ where: { id: chatId } });
    if (!exists) throw new NotFoundException("CHAT_NOT_FOUND");
    if (!(await this.isParticipant(userId, chatId))) {
      throw new ForbiddenException("FORBIDDEN");
    }

    const take = Math.min(Math.max(limit | 0 || HISTORY_LIMIT_DEFAULT, 1), HISTORY_LIMIT_MAX);

    const rows = await this.prisma.message.findMany({
      where: {
        chatId,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      include: { sender: { select: { anonId: true } } },
    });

    const hasMore = rows.length > take;
    const slice = hasMore ? rows.slice(0, take) : rows;
    const messages: ChatMessage[] = slice
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id,
        chatId: m.chatId,
        senderId: m.senderId,
        senderAnonId: m.sender.anonId ?? "?",
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      }));

    return { messages, hasMore };
  }
}

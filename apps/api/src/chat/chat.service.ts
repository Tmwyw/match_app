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

  async sendMessage(
    senderId: string,
    input: SendMessageInput,
  ): Promise<SendMessageResult> {
    if (!(await this.isParticipant(senderId, input.chatId))) {
      throw new ForbiddenException("FORBIDDEN");
    }

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
    return { message, filtered };
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

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  AdminBanInput,
  AdminChatTranscript,
  AdminStats,
  AdminUserDetail,
  AdminUserStatus,
  AdminUserSummary,
  AdminUsersResponse,
} from "@tg-app-meet/shared";
import { ChatGateway } from "../chat/chat.gateway";
import { PrismaService } from "../prisma.service";

const USER_LIST_PAGE_MAX = 100;
const USER_LIST_PAGE_DEFAULT = 50;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChatGateway,
  ) {}

  // ─── Stats ────────────────────────────────────────────────────────────────

  async getStats(): Promise<AdminStats> {
    const now = new Date();
    const day = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      usersTotal,
      usersWithRole,
      buyers,
      owners,
      banned,
      deleted,
      new24h,
      new7d,
      matchesTotal,
      matches24h,
      matches7d,
      messagesTotal,
      messages24h,
      reportsOpen,
      reportsResolved,
      reports7d,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: { not: null } } }),
      this.prisma.user.count({ where: { role: "BUYER" } }),
      this.prisma.user.count({ where: { role: "OWNER" } }),
      this.prisma.user.count({ where: { bannedAt: { not: null } } }),
      this.prisma.user.count({ where: { deletedAt: { not: null } } }),
      this.prisma.user.count({ where: { createdAt: { gte: day } } }),
      this.prisma.user.count({ where: { createdAt: { gte: week } } }),
      this.prisma.match.count(),
      this.prisma.match.count({ where: { createdAt: { gte: day } } }),
      this.prisma.match.count({ where: { createdAt: { gte: week } } }),
      this.prisma.message.count(),
      this.prisma.message.count({ where: { createdAt: { gte: day } } }),
      this.prisma.report.count({ where: { resolvedAt: null } }),
      this.prisma.report.count({ where: { resolvedAt: { not: null } } }),
      this.prisma.report.count({ where: { createdAt: { gte: week } } }),
    ]);

    return {
      users: {
        total: usersTotal,
        withRole: usersWithRole,
        buyers,
        owners,
        banned,
        deleted,
        onlineNow: this.gateway.onlineCount(),
        new24h,
        new7d,
      },
      matches: {
        total: matchesTotal,
        last24h: matches24h,
        last7d: matches7d,
      },
      messages: { total: messagesTotal, last24h: messages24h },
      reports: { open: reportsOpen, resolved: reportsResolved, last7d: reports7d },
    };
  }

  // ─── User list ────────────────────────────────────────────────────────────

  async listUsers(opts: {
    q?: string;
    status?: AdminUserStatus;
    role?: "BUYER" | "OWNER";
    take?: number;
    skip?: number;
  }): Promise<AdminUsersResponse> {
    const take = clampPage(opts.take);
    const skip = Math.max(0, opts.skip ?? 0);

    const where: Prisma.UserWhereInput = {};
    if (opts.role) where.role = opts.role;

    switch (opts.status) {
      case "active":
        where.bannedAt = null;
        where.deletedAt = null;
        break;
      case "banned":
        where.bannedAt = { not: null };
        break;
      case "deleted":
        where.deletedAt = { not: null };
        break;
      // "any" / undefined → no filter
    }

    if (opts.q && opts.q.trim().length > 0) {
      const q = opts.q.trim();
      const isLikelyId = /^[a-z0-9]{15,}$/i.test(q);
      const isNumericTgId = /^\d+$/.test(q);
      const orClauses: Prisma.UserWhereInput[] = [
        { anonId: { contains: q, mode: "insensitive" } },
        { username: { contains: q.replace(/^@/, ""), mode: "insensitive" } },
      ];
      if (isLikelyId) orClauses.push({ id: q });
      if (isNumericTgId) {
        try {
          orClauses.push({ telegramId: BigInt(q) });
        } catch {
          // ignore — number too large for BigInt or otherwise unusable
        }
      }
      where.OR = orClauses;
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
        include: {
          _count: {
            select: {
              matchesA: true,
              matchesB: true,
              messages: true,
              reportsAgainst: true,
              blocksAgainst: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      total,
      rows: rows.map((u) => this.toSummary(u)),
    };
  }

  // ─── User detail ──────────────────────────────────────────────────────────

  async getUserDetail(id: string): Promise<AdminUserDetail> {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        buyerProfile: true,
        ownerProfile: true,
        _count: {
          select: {
            matchesA: true,
            matchesB: true,
            messages: true,
            reportsAgainst: true,
            blocksAgainst: true,
          },
        },
      },
    });
    if (!u) throw new NotFoundException("USER_NOT_FOUND");

    const [reports, matches] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where: { targetUserId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { reporter: { select: { anonId: true } } },
      }),
      this.prisma.match.findMany({
        where: { OR: [{ userAId: id }, { userBId: id }] },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          userA: { select: { id: true, anonId: true } },
          userB: { select: { id: true, anonId: true } },
          chat: {
            select: {
              id: true,
              messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { createdAt: true },
              },
              _count: { select: { messages: true } },
            },
          },
        },
      }),
    ]);

    return {
      ...this.toSummary(u),
      buyerProfile: u.buyerProfile
        ? {
            verticals: u.buyerProfile.verticals,
            geos: u.buyerProfile.geos,
            budgetMin: u.buyerProfile.budgetMin,
            budgetMax: u.buyerProfile.budgetMax,
            experience: u.buyerProfile.experience,
            bio: u.buyerProfile.bio,
            isActive: u.buyerProfile.isActive,
          }
        : null,
      ownerProfile: u.ownerProfile
        ? {
            offerName: u.ownerProfile.offerName,
            trafficSources: u.ownerProfile.trafficSources,
            verticals: u.ownerProfile.verticals,
            geos: u.ownerProfile.geos,
            payoutMin: u.ownerProfile.payoutMin,
            payoutMax: u.ownerProfile.payoutMax,
            requirements: u.ownerProfile.requirements,
            bio: u.ownerProfile.bio,
            isActive: u.ownerProfile.isActive,
          }
        : null,
      recentReportsAgainst: reports.map((r) => ({
        id: r.id,
        reason: r.reason,
        details: r.details,
        reporterAnonId: r.reporter.anonId,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        resolution: r.resolution,
      })),
      recentChats: matches
        .filter((m) => m.chat)
        .map((m) => {
          const other = m.userAId === id ? m.userB : m.userA;
          return {
            chatId: m.chat!.id,
            matchId: m.id,
            otherUserId: other.id,
            otherAnonId: other.anonId,
            messagesCount: m.chat!._count.messages,
            lastMessageAt:
              m.chat!.messages[0]?.createdAt?.toISOString() ?? null,
          };
        }),
    };
  }

  // ─── Ban / unban ──────────────────────────────────────────────────────────

  async ban(id: string, input: AdminBanInput): Promise<AdminUserDetail> {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    if (!u) throw new NotFoundException("USER_NOT_FOUND");
    if (u.deletedAt) throw new BadRequestException("USER_DELETED");
    await this.prisma.user.update({
      where: { id },
      data: { bannedAt: new Date(), banReason: input.reason },
    });
    return this.getUserDetail(id);
  }

  async unban(id: string): Promise<AdminUserDetail> {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, bannedAt: true },
    });
    if (!u) throw new NotFoundException("USER_NOT_FOUND");
    if (!u.bannedAt) throw new BadRequestException("NOT_BANNED");
    await this.prisma.user.update({
      where: { id },
      data: { bannedAt: null, banReason: null },
    });
    return this.getUserDetail(id);
  }

  /** Operator-side: clear role + anonId + delete profile so the user lands on
   *  RolePicker on next launch. Existing matches/messages/swipes stay intact —
   *  we just want to force re-onboarding. */
  async resetUserRole(id: string): Promise<AdminUserDetail> {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!u) throw new NotFoundException("USER_NOT_FOUND");
    await this.prisma.$transaction([
      this.prisma.buyerProfile.deleteMany({ where: { userId: id } }),
      this.prisma.ownerProfile.deleteMany({ where: { userId: id } }),
      this.prisma.user.update({
        where: { id },
        data: { role: null, anonId: null },
      }),
    ]);
    return this.getUserDetail(id);
  }

  // ─── Chat forensics ───────────────────────────────────────────────────────

  async getChatTranscript(chatId: string): Promise<AdminChatTranscript> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        match: {
          include: {
            userA: {
              select: {
                id: true,
                anonId: true,
                role: true,
                username: true,
                bannedAt: true,
                deletedAt: true,
              },
            },
            userB: {
              select: {
                id: true,
                anonId: true,
                role: true,
                username: true,
                bannedAt: true,
                deletedAt: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { sender: { select: { anonId: true } } },
        },
      },
    });
    if (!chat) throw new NotFoundException("CHAT_NOT_FOUND");

    return {
      chatId: chat.id,
      matchId: chat.matchId,
      participants: [
        {
          id: chat.match.userA.id,
          anonId: chat.match.userA.anonId,
          role: chat.match.userA.role,
          username: chat.match.userA.username,
          bannedAt: chat.match.userA.bannedAt?.toISOString() ?? null,
          deletedAt: chat.match.userA.deletedAt?.toISOString() ?? null,
        },
        {
          id: chat.match.userB.id,
          anonId: chat.match.userB.anonId,
          role: chat.match.userB.role,
          username: chat.match.userB.username,
          bannedAt: chat.match.userB.bannedAt?.toISOString() ?? null,
          deletedAt: chat.match.userB.deletedAt?.toISOString() ?? null,
        },
      ],
      messages: chat.messages.map((m) => ({
        id: m.id,
        chatId: m.chatId,
        senderId: m.senderId,
        senderAnonId: m.sender.anonId,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        editedAt: m.editedAt?.toISOString() ?? null,
        readAt: m.readAt?.toISOString() ?? null,
      })),
    };
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private toSummary(u: {
    id: string;
    telegramId: bigint;
    username: string | null;
    role: "BUYER" | "OWNER" | null;
    anonId: string | null;
    createdAt: Date;
    lastSeenAt: Date | null;
    deletedAt: Date | null;
    bannedAt: Date | null;
    banReason: string | null;
    _count: {
      matchesA: number;
      matchesB: number;
      messages: number;
      reportsAgainst: number;
      blocksAgainst: number;
    };
  }): AdminUserSummary {
    return {
      id: u.id,
      telegramId: u.telegramId.toString(),
      username: u.username,
      role: u.role,
      anonId: u.anonId,
      createdAt: u.createdAt.toISOString(),
      lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      deletedAt: u.deletedAt?.toISOString() ?? null,
      bannedAt: u.bannedAt?.toISOString() ?? null,
      banReason: u.banReason,
      isOnline: this.gateway.isOnline(u.id),
      counts: {
        matches: u._count.matchesA + u._count.matchesB,
        messages: u._count.messages,
        reportsAgainst: u._count.reportsAgainst,
        blocksAgainst: u._count.blocksAgainst,
      },
    };
  }
}

function clampPage(n: number | undefined): number {
  if (!n || n <= 0) return USER_LIST_PAGE_DEFAULT;
  return Math.min(n, USER_LIST_PAGE_MAX);
}

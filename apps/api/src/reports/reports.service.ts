import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AdminReport,
  AdminReportsResponse,
  CreateReportInput,
  ReportResponse,
  ResolveReportInput,
} from "@tg-app-meet/shared";
import { PrismaService } from "../prisma.service";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(reporterId: string, input: CreateReportInput): Promise<ReportResponse> {
    if (input.targetUserId === reporterId) {
      throw new BadRequestException("CANNOT_REPORT_SELF");
    }
    const target = await this.prisma.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException("TARGET_NOT_FOUND");

    const row = await this.prisma.report.create({
      data: {
        reporterId,
        targetUserId: input.targetUserId,
        chatId: input.chatId ?? null,
        reason: input.reason,
        details: input.details ?? null,
      },
    });
    return { id: row.id, createdAt: row.createdAt.toISOString() };
  }

  async listForAdmin(includeResolved: boolean): Promise<AdminReportsResponse> {
    const rows = await this.prisma.report.findMany({
      where: includeResolved ? {} : { resolvedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        reporter: { select: { anonId: true } },
        target: {
          select: { anonId: true, username: true, bannedAt: true },
        },
      },
      take: 200,
    });

    return rows.map<AdminReport>((r) => ({
      id: r.id,
      reporterId: r.reporterId,
      reporterAnonId: r.reporter.anonId,
      targetUserId: r.targetUserId,
      targetAnonId: r.target.anonId,
      targetUsername: r.target.username,
      targetBannedAt: r.target.bannedAt?.toISOString() ?? null,
      chatId: r.chatId,
      reason: r.reason as AdminReport["reason"],
      details: r.details,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      resolution: (r.resolution as AdminReport["resolution"]) ?? null,
    }));
  }

  async resolve(reportId: string, input: ResolveReportInput): Promise<AdminReport> {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException("REPORT_NOT_FOUND");
    if (report.resolvedAt) throw new ForbiddenException("ALREADY_RESOLVED");

    await this.prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: reportId },
        data: { resolvedAt: new Date(), resolution: input.resolution },
      });
      if (input.resolution === "banned") {
        await tx.user.update({
          where: { id: report.targetUserId },
          data: {
            bannedAt: new Date(),
            banReason: input.banReason ?? `report:${report.reason}`,
          },
        });
      }
    });

    const [updated] = await this.listForAdmin(true).then((rs) =>
      rs.filter((r) => r.id === reportId),
    );
    if (!updated) throw new NotFoundException("REPORT_NOT_FOUND");
    return updated;
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  type AdminReport,
  type AdminReportsResponse,
  ResolveReportInput,
} from "@tg-app-meet/shared";
import { AdminGuard } from "../common/admin.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ReportsService } from "./reports.service";

@Controller("admin/reports")
@UseGuards(AdminGuard)
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  async list(@Query("resolved") resolved?: string): Promise<AdminReportsResponse> {
    const includeResolved = resolved === "true";
    return this.reports.listForAdmin(includeResolved);
  }

  @Post(":id/resolve")
  async resolve(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ResolveReportInput)) body: ResolveReportInput,
  ): Promise<AdminReport> {
    return this.reports.resolve(id, body);
  }
}

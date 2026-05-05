import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  CreateReportInput,
  type ReportResponse,
} from "@tg-app-meet/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RateLimitGuard } from "../common/rate-limit";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ReportsService } from "./reports.service";

@Controller("reports")
@UseGuards(JwtAuthGuard, RateLimitGuard("reports", 5, 600_000))
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  async create(
    @CurrentUser() current: { id: string },
    @Body(new ZodValidationPipe(CreateReportInput)) body: CreateReportInput,
  ): Promise<ReportResponse> {
    return this.reports.create(current.id, body);
  }
}

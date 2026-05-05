import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminReportsController } from "./admin-reports.controller";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [AuthModule],
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

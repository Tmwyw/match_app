import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("health")
  async health() {
    let db: "ok" | "down" = "ok";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      db = "down";
      console.error("[health] db check failed:", e instanceof Error ? e.message : e);
    }
    return { status: "ok", db, ts: new Date().toISOString() };
  }
}

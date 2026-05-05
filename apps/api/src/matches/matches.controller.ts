import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { MatchesListResponse } from "@tg-app-meet/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MatchesService } from "./matches.service";

@Controller("matches")
@UseGuards(JwtAuthGuard)
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  @Get()
  async list(
    @CurrentUser() current: { id: string },
    @Query("archived") archived?: string,
  ): Promise<MatchesListResponse> {
    return this.matches.listMine(current.id, { archived: archived === "true" });
  }

  @Post(":matchId/archive")
  @HttpCode(204)
  async archive(
    @CurrentUser() current: { id: string },
    @Param("matchId") matchId: string,
  ): Promise<void> {
    await this.matches.setArchived(current.id, matchId, true);
  }

  @Delete(":matchId/archive")
  @HttpCode(204)
  async unarchive(
    @CurrentUser() current: { id: string },
    @Param("matchId") matchId: string,
  ): Promise<void> {
    await this.matches.setArchived(current.id, matchId, false);
  }
}

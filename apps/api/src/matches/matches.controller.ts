import { Controller, Get, UseGuards } from "@nestjs/common";
import type { MatchesListResponse } from "@tg-app-meet/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MatchesService } from "./matches.service";

@Controller("matches")
@UseGuards(JwtAuthGuard)
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  @Get()
  async list(@CurrentUser() current: { id: string }): Promise<MatchesListResponse> {
    return this.matches.listMine(current.id);
  }
}

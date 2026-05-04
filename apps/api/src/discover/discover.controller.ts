import { Controller, Get, UseGuards } from "@nestjs/common";
import type { DiscoverResponse } from "@tg-app-meet/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DiscoverService } from "./discover.service";

@Controller("discover")
@UseGuards(JwtAuthGuard)
export class DiscoverController {
  constructor(private readonly discover: DiscoverService) {}

  @Get()
  async next(@CurrentUser() current: { id: string }): Promise<DiscoverResponse> {
    return this.discover.next(current.id);
  }
}

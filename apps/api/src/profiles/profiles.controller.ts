import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import type { MyProfileResponse } from "@tg-app-meet/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ProfilesService } from "./profiles.service";

@Controller("me/profile")
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  async getMine(@CurrentUser() current: { id: string }): Promise<MyProfileResponse> {
    return this.profiles.getMine(current.id);
  }

  @Post()
  async createMine(
    @CurrentUser() current: { id: string },
    @Body() body: unknown,
  ): Promise<MyProfileResponse> {
    return this.profiles.createMine(current.id, body);
  }

  @Patch()
  async patchMine(
    @CurrentUser() current: { id: string },
    @Body() body: unknown,
  ): Promise<MyProfileResponse> {
    return this.profiles.patchMine(current.id, body);
  }
}

import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { RevealStatus } from "@tg-app-meet/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RevealService } from "./reveal.service";

@Controller("chats/:chatId/reveal")
@UseGuards(JwtAuthGuard)
export class RevealController {
  constructor(private readonly reveal: RevealService) {}

  @Get()
  async get(
    @CurrentUser() current: { id: string },
    @Param("chatId") chatId: string,
  ): Promise<RevealStatus> {
    return this.reveal.getStatus(current.id, chatId);
  }

  @Post()
  async accept(
    @CurrentUser() current: { id: string },
    @Param("chatId") chatId: string,
  ): Promise<RevealStatus> {
    return this.reveal.accept(current.id, chatId);
  }
}

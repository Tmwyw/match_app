import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { ChatHistoryResponse } from "@tg-app-meet/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ChatService } from "./chat.service";

@Controller("chats/:chatId/messages")
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  async list(
    @CurrentUser() current: { id: string },
    @Param("chatId") chatId: string,
    @Query("before") before?: string,
    @Query("after") after?: string,
    @Query("limit") limit?: string,
  ): Promise<ChatHistoryResponse> {
    return this.chat.getHistory(current.id, chatId, {
      before: before ? new Date(before) : undefined,
      after: after ? new Date(after) : undefined,
      limit: limit ? Number(limit) : 50,
    });
  }
}

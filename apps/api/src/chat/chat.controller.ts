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
    @Query("limit") limit?: string,
  ): Promise<ChatHistoryResponse> {
    const beforeDate = before ? new Date(before) : undefined;
    const limitNum = limit ? Number(limit) : 50;
    return this.chat.getHistory(current.id, chatId, beforeDate, limitNum);
  }
}

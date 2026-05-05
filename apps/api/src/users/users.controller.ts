import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { MeResponse, PresenceResponse } from "@tg-app-meet/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { toPublicUser } from "../auth/public-user";
import { ChatGateway } from "../chat/chat.gateway";
import { ChatService } from "../chat/chat.service";
import { PrismaService } from "../prisma.service";

@Controller()
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
  ) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() current: { id: string }): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: current.id } });
    // 401 (not 404): a valid JWT pointing at a deleted user is, semantically,
    // an unusable credential. Returning 401 lets the frontend's existing
    // 401-handling clear the stale token and re-auth via initData.
    if (!user) throw new UnauthorizedException("user no longer exists");
    return toPublicUser(user);
  }

  @Delete("me")
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async deleteMe(@CurrentUser() current: { id: string }): Promise<void> {
    // Soft-delete: physically removing the row would cascade-delete
    // every Match/Chat/Message/ContactReveal the user was in, leaving the
    // partner with an empty inbox. Instead, scrub the identity bits and
    // mark the timestamp; subsequent auth attempts return 403 ACCOUNT_DELETED
    // and the partner sees a "deleted" plug card in their match list.
    await this.prisma.user.update({
      where: { id: current.id },
      data: {
        deletedAt: new Date(),
        username: null,
        // anonId is unique — null'ing frees the slot in case of future re-creation.
        anonId: null,
      },
    });
  }

  @Get("users/:userId/presence")
  @UseGuards(JwtAuthGuard)
  async presence(
    @CurrentUser() current: { id: string },
    @Param("userId") userId: string,
  ): Promise<PresenceResponse> {
    // Strangers don't get to fish online status — only people we share a
    // match with. Self-query is allowed (used by debug screens).
    await this.chat.assertSharedChat(current.id, userId);
    const stored = await this.chat.getPresence(userId);
    // Live online state lives in the gateway's in-memory map; merge it onto
    // the persisted lastSeenAt for a single coherent answer.
    return { ...stored, online: this.gateway.isOnline(userId) };
  }
}

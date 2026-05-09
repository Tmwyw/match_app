import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  type LikesCountResponse,
  type MeResponse,
  NotificationPrefsPatch,
  type NotificationPrefsResponse,
  type PresenceResponse,
  type PublicCard,
  type ReferralLinkResponse,
} from "@tg-app-meet/shared";
import { Bot } from "grammy";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { toMeResponse } from "../auth/public-user";
import { BlocksService } from "../blocks/blocks.service";
import { ChatGateway } from "../chat/chat.gateway";
import { ChatService } from "../chat/chat.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { env } from "../env";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma.service";
import { toPublicCard, type UserWithProfiles } from "../profiles/public-card";
import { SwipesService } from "../swipes/swipes.service";

/**
 * Cached @bot username so we don't hit the Bot API on every /me/referral-link
 * call. The bot username never changes for a given BOT_TOKEN, so caching
 * for the lifetime of the process is safe.
 */
let cachedBotUsername: string | null = null;

@Controller()
export class UsersController {
  // Created lazily for /me/referral-link only — no .start(), no long-poll.
  private readonly bot = new Bot(env.BOT_TOKEN);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
    private readonly swipes: SwipesService,
    private readonly notifications: NotificationsService,
    private readonly blocks: BlocksService,
  ) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() current: { id: string }): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: current.id } });
    if (!user) throw new UnauthorizedException("user no longer exists");
    const referralCount = await this.prisma.user.count({
      where: { referredById: current.id, deletedAt: null },
    });
    return toMeResponse(user, { referralCount });
  }

  @Delete("me")
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async deleteMe(@CurrentUser() current: { id: string }): Promise<void> {
    await this.prisma.user.update({
      where: { id: current.id },
      data: {
        deletedAt: new Date(),
        username: null,
        anonId: null,
      },
    });
  }

  /**
   * Clears the bot-set deep-link payload after the frontend has acted on
   * it. Called once per Mini App launch when pendingViewProfile != null
   * so we don't re-open the same card every time.
   */
  @Delete("me/pending-view")
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async clearPendingView(@CurrentUser() current: { id: string }): Promise<void> {
    await this.prisma.user.update({
      where: { id: current.id },
      data: { pendingViewProfile: null },
    });
  }

  /**
   * Reset deck — clears every swipe the current user made that did NOT
   * produce a match, so they can re-discover those candidates. Matches
   * stay intact (deleting them would orphan an active chat). Returns
   * the number of swipes removed for client-side feedback.
   */
  @Delete("me/swipes")
  @UseGuards(JwtAuthGuard)
  async resetSwipes(
    @CurrentUser() current: { id: string },
  ): Promise<{ removed: number }> {
    return this.swipes.resetSwipes(current.id);
  }

  @Get("me/likes/count")
  @UseGuards(JwtAuthGuard)
  async likesCount(@CurrentUser() current: { id: string }): Promise<LikesCountResponse> {
    return { count: await this.swipes.inboundLikesCount(current.id) };
  }

  @Get("me/notifications")
  @UseGuards(JwtAuthGuard)
  async getPrefs(
    @CurrentUser() current: { id: string },
  ): Promise<NotificationPrefsResponse> {
    const p = await this.notifications.getPrefs(current.id);
    return {
      matches: p.matches,
      messages: p.messages,
      digestMode: p.digestMode,
      mutedUntil: p.mutedUntil?.toISOString() ?? null,
    };
  }

  @Patch("me/notifications")
  @UseGuards(JwtAuthGuard)
  async patchPrefs(
    @CurrentUser() current: { id: string },
    @Body(new ZodValidationPipe(NotificationPrefsPatch))
    patch: { matches?: boolean; messages?: boolean; digestMode?: boolean; mutedUntil?: string | null },
  ): Promise<NotificationPrefsResponse> {
    const p = await this.notifications.patchPrefs(current.id, patch);
    return {
      matches: p.matches,
      messages: p.messages,
      digestMode: p.digestMode,
      mutedUntil: p.mutedUntil?.toISOString() ?? null,
    };
  }

  @Get("me/referral-link")
  @UseGuards(JwtAuthGuard)
  async referralLink(
    @CurrentUser() current: { id: string },
  ): Promise<ReferralLinkResponse> {
    const username = await this.resolveBotUsername();
    return {
      link: `https://t.me/${username}?start=ref_${current.id}`,
    };
  }

  @Get("users/:userId/presence")
  @UseGuards(JwtAuthGuard)
  async presence(
    @CurrentUser() current: { id: string },
    @Param("userId") userId: string,
  ): Promise<PresenceResponse> {
    await this.chat.assertSharedChat(current.id, userId);
    const stored = await this.chat.getPresence(userId);
    return { ...stored, online: this.gateway.isOnline(userId) };
  }

  /**
   * Public card for any user — used by the deep-link viewer (`?start=p_<id>`).
   * Refuses if the target is deleted/banned, or if either side has a block
   * against the other (mirrors discover/matches visibility).
   */
  @Get("users/:userId/card")
  @UseGuards(JwtAuthGuard)
  async card(
    @CurrentUser() current: { id: string },
    @Param("userId") userId: string,
  ): Promise<PublicCard> {
    if (userId === current.id) {
      throw new ForbiddenException("OWN_CARD");
    }
    if (await this.blocks.existsBetween(current.id, userId)) {
      throw new ForbiddenException("BLOCKED");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { buyerProfile: true, ownerProfile: true },
    });
    if (!user || user.deletedAt || user.bannedAt || !user.role || !user.anonId) {
      throw new NotFoundException("USER_NOT_FOUND");
    }
    // Profile-moderation gate. Pending profiles must not leak through
    // /users/:userId/card either — same rule as discover.
    if (user.profileApprovedAt == null) {
      throw new NotFoundException("USER_NOT_FOUND");
    }
    // Carry the "Likes You" flag onto deep-link card views too — the
    // user might open this card from the inbound-likes badge in the
    // future, and even today the bot's `?start=p_<id>` deep-link could
    // open the card of someone who already liked them.
    const likedYou = await this.swipes.hasInboundLike(current.id, userId);
    return toPublicCard(user as UserWithProfiles, { likedYou });
  }

  private async resolveBotUsername(): Promise<string> {
    if (cachedBotUsername) return cachedBotUsername;
    const me = await this.bot.api.getMe();
    if (!me.username) {
      throw new NotFoundException("bot has no username");
    }
    cachedBotUsername = me.username;
    return me.username;
  }
}

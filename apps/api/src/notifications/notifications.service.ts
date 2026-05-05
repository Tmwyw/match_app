import { Injectable, Logger } from "@nestjs/common";
import { Bot } from "grammy";
import { env } from "../env";
import { PrismaService } from "../prisma.service";

const MESSAGE_DEBOUNCE_MS = 30_000;
const PREVIEW_MAX = 80;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly bot: Bot;
  // key: `${chatId}:${recipientUserId}` → unix ms of last sent push
  private readonly lastMessageNotif = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {
    // Bot is used as a Telegram Bot API client only — no .start() here.
    // The long-poll bot lives in apps/bot. Two pollers on the same token
    // would race for getUpdates and lose messages.
    this.bot = new Bot(env.BOT_TOKEN);
  }

  async notifyMatch(toUserId: string, otherAnonId: string): Promise<void> {
    const tgId = await this.resolveTelegramId(toUserId);
    if (tgId === null) return;
    await this.send(
      tgId,
      `🎉 Новый матч с ${otherAnonId}!\n\nОткрой приложение, чтобы начать общаться.`,
    );
  }

  async notifyMessage(
    toUserId: string,
    fromAnonId: string,
    chatId: string,
    content: string,
  ): Promise<void> {
    const key = `${chatId}:${toUserId}`;
    const last = this.lastMessageNotif.get(key) ?? 0;
    const now = Date.now();
    if (now - last < MESSAGE_DEBOUNCE_MS) return;
    // Set the timestamp before awaiting the network call so a burst of
    // messages can't race past the debounce while the first push is in flight.
    this.lastMessageNotif.set(key, now);

    const tgId = await this.resolveTelegramId(toUserId);
    if (tgId === null) return;

    const preview =
      content.length > PREVIEW_MAX ? content.slice(0, PREVIEW_MAX - 1) + "…" : content;
    await this.send(tgId, `💬 ${fromAnonId}\n\n${preview}`);
  }

  private async resolveTelegramId(userId: string): Promise<number | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    });
    if (!user) return null;
    return Number(user.telegramId);
  }

  private async send(tgChatId: number, text: string): Promise<void> {
    try {
      await this.bot.api.sendMessage(tgChatId, text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Открыть", web_app: { url: env.WEB_APP_URL } }],
          ],
        },
      });
    } catch (e) {
      // Most common: 403 "bot was blocked by the user". Also: 400 "chat not
      // found" if Telegram garbage-collected the chat. Never crash the caller.
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`sendMessage to ${tgChatId} failed: ${msg}`);
    }
  }
}

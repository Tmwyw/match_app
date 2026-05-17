import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import type { NotificationPrefs } from "@prisma/client";
import { Bot } from "grammy";
import { env } from "../env";
import { PrismaService } from "../prisma.service";

const PREVIEW_MAX = 80;
/** How long to trust a cached prefs row before re-reading from Postgres. */
const PREFS_CACHE_TTL_MS = 60_000;
/** Cadence for the message-digest flush loop. */
const DIGEST_FLUSH_INTERVAL_MS = 10 * 60_000;

type CachedPrefs = { value: NotificationPrefs; cachedAt: number };
type PendingDigest = {
  /** Map<chatId → message preview accumulator>. */
  perChat: Map<string, { fromAnonId: string; count: number }>;
};

@Injectable()
export class NotificationsService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly bot: Bot;
  // key: userId → cached prefs row (TTL via cachedAt)
  private readonly prefsCache = new Map<string, CachedPrefs>();
  // key: recipient userId → pending message-digest accumulator (digestMode users)
  private readonly digestQueue = new Map<string, PendingDigest>();
  private readonly digestTimer: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {
    // Bot is used as a Telegram Bot API client only — no .start() here.
    // The long-poll bot lives in apps/bot. Two pollers on the same token
    // would race for getUpdates and lose messages.
    this.bot = new Bot(env.BOT_TOKEN);

    // Periodic digest flush. Runs in-process — fine for single-instance
    // MVP; if we shard the API later this needs Redis or a per-shard
    // election to avoid double-sends.
    this.digestTimer = setInterval(() => {
      void this.flushDigests().catch((e) =>
        this.logger.warn(`digest flush failed: ${e instanceof Error ? e.message : e}`),
      );
    }, DIGEST_FLUSH_INTERVAL_MS);
    // Don't keep the event loop alive just for the timer.
    this.digestTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.digestTimer);
  }

  async getPrefs(userId: string): Promise<NotificationPrefs> {
    const cached = this.prefsCache.get(userId);
    if (cached && Date.now() - cached.cachedAt < PREFS_CACHE_TTL_MS) {
      return cached.value;
    }
    // Lazy-create defaults so callers never have to think about whether the
    // row exists. Upsert keeps it idempotent under concurrent first-reads.
    const row = await this.prisma.notificationPrefs.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    this.prefsCache.set(userId, { value: row, cachedAt: Date.now() });
    return row;
  }

  async patchPrefs(
    userId: string,
    patch: Partial<{
      matches: boolean;
      messages: boolean;
      digestMode: boolean;
      mutedUntil: string | null;
    }>,
  ): Promise<NotificationPrefs> {
    const updated = await this.prisma.notificationPrefs.upsert({
      where: { userId },
      create: {
        userId,
        ...(patch.matches !== undefined ? { matches: patch.matches } : {}),
        ...(patch.messages !== undefined ? { messages: patch.messages } : {}),
        ...(patch.digestMode !== undefined ? { digestMode: patch.digestMode } : {}),
        ...(patch.mutedUntil !== undefined
          ? { mutedUntil: patch.mutedUntil ? new Date(patch.mutedUntil) : null }
          : {}),
      },
      update: {
        ...(patch.matches !== undefined ? { matches: patch.matches } : {}),
        ...(patch.messages !== undefined ? { messages: patch.messages } : {}),
        ...(patch.digestMode !== undefined ? { digestMode: patch.digestMode } : {}),
        ...(patch.mutedUntil !== undefined
          ? { mutedUntil: patch.mutedUntil ? new Date(patch.mutedUntil) : null }
          : {}),
      },
    });
    // Drop cache so the next push uses fresh prefs immediately.
    this.prefsCache.delete(userId);
    return updated;
  }

  /**
   * One-shot push fired when admin transitions the user from pending →
   * approved. Bypasses the matches/messages prefs and the mute window —
   * this is a transactional account-state notification, not marketing.
   * Still respects the same fire-and-forget contract as everything else
   * here (errors logged, never propagated).
   */
  async notifyProfileApproved(toUserId: string): Promise<void> {
    const tgId = await this.resolveTelegramId(toUserId);
    if (tgId === null) return;
    await this.send(
      tgId,
      "✅ Ваша заявка одобрена и теперь видна всем соискателям.\n\n" +
        "Поиск тоже доступен — жми кнопку ниже, чтобы открыть приложение 👇",
    );
  }

  /**
   * Fan-out to every admin Telegram ID listed in env.ADMIN_TELEGRAM_IDS
   * when a fresh profile lands in the moderation queue. Bypasses prefs
   * entirely — admins get the DM regardless of their own notification
   * settings (this is operational, not personal). Errors are swallowed
   * per-recipient so one blocked-bot admin doesn't kill the fan-out.
   */
  async notifyAdminsNewSubmission(opts: {
    anonId: string;
    role: "BUYER" | "OWNER";
  }): Promise<void> {
    const admins = env.ADMIN_TELEGRAM_IDS;
    this.logger.log(
      `notifyAdminsNewSubmission CALL anonId=${opts.anonId} role=${opts.role} admins=${JSON.stringify(admins)}`,
    );
    if (admins.length === 0) {
      this.logger.warn(
        "notifyAdminsNewSubmission SKIP: ADMIN_TELEGRAM_IDS env empty",
      );
      return;
    }
    const roleRu = opts.role === "BUYER" ? "БАЕР" : "ОВНЕР";
    // anonId is system-generated ("Buyer #5" pattern), no HTML escape
    // needed.
    const text =
      `📋 <b>Новая заявка на модерацию</b>\n\n` +
      `<b>${opts.anonId}</b> · ${roleRu}\n\n` +
      `Открой /admin → 📋 Модерация чтобы рассмотреть.`;
    for (const tgId of admins) {
      try {
        await this.bot.api.sendMessage(tgId, text, { parse_mode: "HTML" });
        this.logger.log(`notifyAdminsNewSubmission SEND ok tg:${tgId}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(
          `notifyAdminsNewSubmission failed for ${tgId}: ${msg}`,
        );
      }
    }
  }

  /**
   * One-sided LIKE push — fires when someone LIKE-swipes the user
   * without producing a mutual match. Reuses the prefs.matches toggle
   * (same "Лайки" switch in Settings UI controls both inbound likes
   * and mutual-match notifications) so users have a single off-switch.
   * Mute window also respected.
   */
  async notifyInboundLike(toUserId: string): Promise<void> {
    const prefs = await this.safePrefs(toUserId);
    if (!prefs.matches) return; // shared "Лайки" toggle in Settings
    if (this.isMuted(prefs)) return;

    const tgId = await this.resolveTelegramId(toUserId);
    if (tgId === null) return;
    this.logger.log(`notifyInboundLike SEND ${toUserId} → tg:${tgId}`);
    await this.send(
      tgId,
      "💜 Кто-то тебя лайкнул!\n\nОткрой приложение чтобы посмотреть кто и матчнуться.",
    );
  }

  async notifyMatch(toUserId: string, otherAnonId: string): Promise<void> {
    const prefs = await this.safePrefs(toUserId);
    if (!prefs.matches) {
      this.logger.warn(`notifyMatch SKIP ${toUserId}: prefs.matches=false`);
      return;
    }
    if (this.isMuted(prefs)) {
      this.logger.warn(
        `notifyMatch SKIP ${toUserId}: muted until ${prefs.mutedUntil?.toISOString()}`,
      );
      return;
    }

    const tgId = await this.resolveTelegramId(toUserId);
    if (tgId === null) {
      this.logger.warn(`notifyMatch SKIP ${toUserId}: no telegramId resolved`);
      return;
    }
    this.logger.log(`notifyMatch SEND ${toUserId} → tg:${tgId}`);
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
    const prefs = await this.safePrefs(toUserId);
    if (!prefs.messages) {
      this.logger.warn(`notifyMessage SKIP ${toUserId}: prefs.messages=false`);
      return;
    }
    if (this.isMuted(prefs)) {
      this.logger.warn(
        `notifyMessage SKIP ${toUserId}: muted until ${prefs.mutedUntil?.toISOString()}`,
      );
      return;
    }

    if (prefs.digestMode) {
      this.logger.log(`notifyMessage DIGEST ${toUserId} chat=${chatId}`);
      this.enqueueDigest(toUserId, chatId, fromAnonId);
      return;
    }

    // No debounce — every offline message gets its own push, per user
    // request. (Previously was 1 push per (chat, recipient) per 30s
    // to avoid spam, but users found it confusing when partners sent
    // multiple messages and only the first surfaced.)

    const tgId = await this.resolveTelegramId(toUserId);
    if (tgId === null) {
      this.logger.warn(`notifyMessage SKIP ${toUserId}: no telegramId resolved`);
      return;
    }

    const preview =
      content.length > PREVIEW_MAX ? content.slice(0, PREVIEW_MAX - 1) + "…" : content;
    this.logger.log(`notifyMessage SEND ${toUserId} → tg:${tgId} chat=${chatId}`);
    // Pass chatId so the inline "Открыть" button deep-links straight
    // into this conversation when the user taps it from the bot DM.
    await this.send(tgId, `💬 ${fromAnonId}\n\n${preview}`, { chatId });
  }

  private enqueueDigest(toUserId: string, chatId: string, fromAnonId: string): void {
    let bucket = this.digestQueue.get(toUserId);
    if (!bucket) {
      bucket = { perChat: new Map() };
      this.digestQueue.set(toUserId, bucket);
    }
    const cur = bucket.perChat.get(chatId);
    if (cur) cur.count += 1;
    else bucket.perChat.set(chatId, { fromAnonId, count: 1 });
  }

  private async flushDigests(): Promise<void> {
    if (this.digestQueue.size === 0) return;
    // Snapshot + clear so concurrent enqueues don't get dropped.
    const snapshot = new Map(this.digestQueue);
    this.digestQueue.clear();

    for (const [userId, bucket] of snapshot) {
      const chatCount = bucket.perChat.size;
      const totalMsgs = Array.from(bucket.perChat.values()).reduce(
        (sum, c) => sum + c.count,
        0,
      );
      const tgId = await this.resolveTelegramId(userId);
      if (tgId === null) continue;
      const text =
        chatCount === 1
          ? `💬 ${totalMsgs} ${plural(totalMsgs, "новое сообщение", "новых сообщения", "новых сообщений")} в одном чате.`
          : `💬 ${totalMsgs} ${plural(totalMsgs, "новое сообщение", "новых сообщения", "новых сообщений")} в ${chatCount} ${plural(chatCount, "чате", "чатах", "чатах")}.`;
      await this.send(tgId, text);
    }
  }

  private isMuted(prefs: NotificationPrefs): boolean {
    return !!prefs.mutedUntil && prefs.mutedUntil.getTime() > Date.now();
  }

  /** Reads prefs without ever throwing — fall back to permissive defaults
   *  if the DB hiccups so a notification never breaks the caller. */
  private async safePrefs(userId: string): Promise<NotificationPrefs> {
    try {
      return await this.getPrefs(userId);
    } catch (e) {
      this.logger.warn(
        `prefs read failed for ${userId}: ${e instanceof Error ? e.message : e}`,
      );
      return {
        userId,
        matches: true,
        messages: true,
        digestMode: false,
        mutedUntil: null,
        updatedAt: new Date(),
      } as NotificationPrefs;
    }
  }

  private async resolveTelegramId(userId: string): Promise<number | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    });
    if (!user) return null;
    return Number(user.telegramId);
  }

  /**
   * Fire-and-forget DM that fires when contact reveal transitions from
   * "one-sided" to "both accepted". Carries an HTML `<a href="tg://user
   * ?id=X">` mention of the OTHER party — Telegram clients render this
   * as a clickable name that opens the user's profile/chat **even when
   * they have no public @username**. This is the canonical way around
   * the "tester has no @handle so reveal is a dead end" problem:
   * constructing tg://user?id from inside the Mini App doesn't work
   * (no peer context), but a bot-sent message with the same URL as an
   * HTML entity works because Telegram resolves it server-side and
   * embeds the user reference into the client's peer cache.
   *
   * Caller invokes this twice per transition (once per direction) so
   * BOTH users get a mention of their counterpart in their own DM.
   */
  async notifyRevealUnlocked(
    toUserId: string,
    otherUserId: string,
    chatId: string,
  ): Promise<void> {
    const [toUser, otherUser] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: toUserId },
        select: { telegramId: true },
      }),
      this.prisma.user.findUnique({
        where: { id: otherUserId },
        select: {
          telegramId: true,
          username: true,
          displayName: true,
          anonId: true,
        },
      }),
    ]);
    if (!toUser || !otherUser) return;
    const toTgId = Number(toUser.telegramId);
    const otherTgId = Number(otherUser.telegramId);
    const otherName =
      (otherUser.displayName?.trim() || otherUser.anonId) ?? "ваш матч";
    const mention = `<a href="tg://user?id=${otherTgId}">${escapeHtml(otherName)}</a>`;
    const usernameLine = otherUser.username
      ? `\n\nИли по нику: @${escapeHtml(otherUser.username)}`
      : "";
    const text =
      `🔓 <b>Контакты открыты!</b>\n\n` +
      `Ваш собеседник: ${mention}\n\n` +
      `Нажмите на имя — Telegram откроет с ним чат напрямую (работает даже если у пользователя не настроен @username).${usernameLine}`;
    this.logger.log(
      `notifyRevealUnlocked SEND ${toUserId} → tg:${toTgId} (other tg:${otherTgId})`,
    );
    await this.send(toTgId, text, { chatId, parseMode: "HTML" });
  }

  private async send(
    tgChatId: number,
    text: string,
    opts?: { chatId?: string; parseMode?: "HTML" | "MarkdownV2" },
  ): Promise<void> {
    try {
      // When a chatId is provided, deep-link the "Открыть" button
      // straight into that conversation. The Mini App reads the
      // `chat=<id>` query param on mount and opens the matching
      // ChatScreen automatically. Plain WEB_APP_URL otherwise.
      const url = opts?.chatId
        ? `${env.WEB_APP_URL}?chat=${encodeURIComponent(opts.chatId)}`
        : env.WEB_APP_URL;
      await this.bot.api.sendMessage(tgChatId, text, {
        ...(opts?.parseMode ? { parse_mode: opts.parseMode } : {}),
        reply_markup: {
          inline_keyboard: [[{ text: "Открыть", web_app: { url } }]],
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

/** Escape user-controlled values before embedding into a `parse_mode: HTML`
 *  Bot API message. We only need the five reserved chars per the docs. */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

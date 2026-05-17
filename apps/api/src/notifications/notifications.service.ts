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
/** Both scheduled-nudge crons tick on this cadence. Per-user cooldown
 *  (lastProfileNudgeAt / lastUnreadNudgeAt) handles the actual send
 *  frequency — running the tick more often than the cooldown is safe
 *  because the SQL filter excludes recently-nudged users. */
const NUDGE_TICK_INTERVAL_MS = 60 * 60_000;
/** Per-user cooldown for the "your profile is incomplete" DM. */
const PROFILE_NUDGE_COOLDOWN_MS = 24 * 60 * 60_000;
/** Per-user cooldown for the "you have unread messages" DM. */
const UNREAD_NUDGE_COOLDOWN_MS = 60 * 60_000;
/** Don't ping a brand-new signup until at least this much has passed —
 *  gives them a chance to come back on their own without spam. After
 *  this grace ends, the daily nudge runs FOREVER until the user
 *  submits a profile (operator policy: бесконечные алёрты). */
const PROFILE_NUDGE_MIN_AGE_MS = 60 * 60_000;
/** Only count unread messages older than this in the unread-nudge
 *  aggregate — gives the existing offline-DM (fired from onSend) time
 *  to land before we pile a second nudge on top. */
const UNREAD_NUDGE_MIN_MSG_AGE_MS = 60 * 60_000;
/** Look-back window for unread messages — older than this and we
 *  consider the chat effectively abandoned, no point nudging. Keeps
 *  the query bounded too. */
const UNREAD_NUDGE_LOOKBACK_MS = 24 * 60 * 60_000;
/** Throttle for the per-recipient DM loop inside a single nudge run —
 *  Telegram's bot API caps at ~30 msg/s globally, so a 50ms gap between
 *  sends keeps us well under that even if we hit the same shard. */
const NUDGE_SEND_THROTTLE_MS = 50;

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
  private readonly profileNudgeTimer: NodeJS.Timeout;
  private readonly unreadNudgeTimer: NodeJS.Timeout;

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

    // Two scheduled-nudge crons. Both tick hourly; each run checks per-
    // user cooldown columns so the effective send frequency matches the
    // intent (24h for profile, 1h for unread). Running in-process is
    // fine for single-instance API; if we shard later this needs the
    // same per-shard election treatment as digestTimer.
    this.profileNudgeTimer = setInterval(() => {
      void this.runProfileNudges().catch((e) =>
        this.logger.warn(
          `profile nudges failed: ${e instanceof Error ? e.message : e}`,
        ),
      );
    }, NUDGE_TICK_INTERVAL_MS);
    this.profileNudgeTimer.unref?.();

    this.unreadNudgeTimer = setInterval(() => {
      void this.runUnreadNudges().catch((e) =>
        this.logger.warn(
          `unread nudges failed: ${e instanceof Error ? e.message : e}`,
        ),
      );
    }, NUDGE_TICK_INTERVAL_MS);
    this.unreadNudgeTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.digestTimer);
    clearInterval(this.profileNudgeTimer);
    clearInterval(this.unreadNudgeTimer);
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
    // Notification prefs / mute are NOT consulted any more — operator
    // policy is "every user gets every notification, no opt-out". The
    // Settings UI toggles for matches/messages/mute still exist client-
    // side but are effectively cosmetic; server bypasses them.
    const tgId = await this.resolveTelegramId(toUserId);
    if (tgId === null) return;
    this.logger.log(`notifyInboundLike SEND ${toUserId} → tg:${tgId}`);
    await this.send(
      tgId,
      "💜 Кто-то тебя лайкнул!\n\nОткрой приложение чтобы посмотреть кто и матчнуться.",
    );
  }

  async notifyMatch(toUserId: string, otherAnonId: string): Promise<void> {
    // Prefs/mute bypassed by policy — see notifyInboundLike for context.
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
    // Prefs/mute/digestMode all bypassed by operator policy — every
    // offline message produces its own immediate DM regardless of the
    // recipient's Settings choices. The digestQueue/flushDigests
    // infrastructure stays around in case a future flow wants batching,
    // but no caller currently routes through it.
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

  /**
   * Daily-cadence nudge to users who finished role-pick but never
   * submitted a profile. Cron ticks hourly; per-user cooldown of 24h is
   * enforced via the lastProfileNudgeAt column.
   *
   *   - createdAt > NOW - 1h   → skip brand-new signups (let them
   *     come back on their own; first nudge fires the next day)
   *
   * No upper age limit — the nudge fires every 24h FOREVER until the
   * user submits a profile (at which point they fall out of the query
   * because buyerProfile/ownerProfile is no longer null). Operator
   * policy: "бесконечные алёрты, прекращаются только когда доделают".
   *
   * Mute and prefs are intentionally NOT honoured here either — this is
   * an operational onboarding follow-up, not chat traffic.
   */
  private async runProfileNudges(): Promise<void> {
    const now = Date.now();
    const cooldown = new Date(now - PROFILE_NUDGE_COOLDOWN_MS);
    const minAge = new Date(now - PROFILE_NUDGE_MIN_AGE_MS);

    const stuck = await this.prisma.user.findMany({
      where: {
        role: { not: null },
        bannedAt: null,
        deletedAt: null,
        // Only the "still onboarding, give them an hour" lower bound.
        // No upper bound — keep nudging until the profile is filled.
        createdAt: { lt: minAge },
        buyerProfile: { is: null },
        ownerProfile: { is: null },
        OR: [
          { lastProfileNudgeAt: null },
          { lastProfileNudgeAt: { lt: cooldown } },
        ],
      },
      select: { id: true, telegramId: true, role: true },
    });

    if (stuck.length === 0) {
      this.logger.log("runProfileNudges: 0 eligible stuck users");
      return;
    }
    this.logger.log(`runProfileNudges: sending ${stuck.length} reminders`);

    for (const u of stuck) {
      const tgId = Number(u.telegramId);
      const roleRu = u.role === "BUYER" ? "баера" : "овнера";
      const text =
        `👋 <b>Не забудь про анкету</b>\n\n` +
        `Ты выбрал роль ${roleRu} в <b>CREO Metrics</b>, но анкета не заполнена. ` +
        `Пока её нет — тебя никто не найдёт, и ты тоже не увидишь подходящих кандидатов.\n\n` +
        `Жми кнопку ниже и закончи — займёт минуту.`;
      try {
        await this.send(tgId, text, { parseMode: "HTML" });
        // Mark sent BEFORE the throttle gap so a subsequent crash
        // doesn't cause us to re-send to anyone we already DM'd.
        await this.prisma.user.update({
          where: { id: u.id },
          data: { lastProfileNudgeAt: new Date() },
        });
      } catch (e) {
        this.logger.warn(
          `profile nudge failed for ${u.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
      await sleep(NUDGE_SEND_THROTTLE_MS);
    }
  }

  /**
   * Hourly nudge to users with stale unread messages. "Stale" = older
   * than UNREAD_NUDGE_MIN_MSG_AGE_MS (1h) — that's enough time for the
   * existing onSend-driven offline DM to have landed; if the user still
   * hasn't read, they've effectively dropped the conversation and need
   * a reminder.
   *
   * Aggregates per-recipient across all their chats — one DM per user
   * mentioning total unread count + chat count + age of oldest unread.
   * Per-user 1h cooldown via lastUnreadNudgeAt prevents the hourly cron
   * from spamming the same user repeatedly while messages sit unread.
   *
   * Bypasses prefs.messages and mute per operator policy — every user
   * with unread messages older than 1h gets the hourly nudge, no opt-
   * out. The 1h cooldown via lastUnreadNudgeAt is the only throttle.
   */
  private async runUnreadNudges(): Promise<void> {
    const now = Date.now();
    const cooldown = new Date(now - UNREAD_NUDGE_COOLDOWN_MS);
    const minMsgAge = new Date(now - UNREAD_NUDGE_MIN_MSG_AGE_MS);
    const lookback = new Date(now - UNREAD_NUDGE_LOOKBACK_MS);

    // Pull all unread messages in the look-back window with enough age.
    // The match join gives us both participant ids so we can compute the
    // recipient (= the participant who isn't the sender) in JS.
    const messages = await this.prisma.message.findMany({
      where: {
        readAt: null,
        createdAt: { lt: minMsgAge, gt: lookback },
      },
      select: {
        chatId: true,
        senderId: true,
        createdAt: true,
        chat: {
          select: {
            match: { select: { userAId: true, userBId: true } },
          },
        },
      },
    });

    if (messages.length === 0) {
      this.logger.log("runUnreadNudges: 0 stale unread messages");
      return;
    }

    // Aggregate per recipient.
    type Agg = { chats: Set<string>; count: number; oldest: Date };
    const perUser = new Map<string, Agg>();
    for (const m of messages) {
      const userAId = m.chat.match.userAId;
      const userBId = m.chat.match.userBId;
      const recipientId = m.senderId === userAId ? userBId : userAId;
      let agg = perUser.get(recipientId);
      if (!agg) {
        agg = { chats: new Set(), count: 0, oldest: m.createdAt };
        perUser.set(recipientId, agg);
      }
      agg.chats.add(m.chatId);
      agg.count += 1;
      if (m.createdAt < agg.oldest) agg.oldest = m.createdAt;
    }

    // Filter by per-user cooldown and ban/delete state only — prefs and
    // mute are bypassed per operator policy ("без ограничений"). The
    // 1h cooldown via lastUnreadNudgeAt is the only throttle.
    const recipientIds = Array.from(perUser.keys());
    const eligible = await this.prisma.user.findMany({
      where: {
        id: { in: recipientIds },
        bannedAt: null,
        deletedAt: null,
        OR: [
          { lastUnreadNudgeAt: null },
          { lastUnreadNudgeAt: { lt: cooldown } },
        ],
      },
      select: { id: true, telegramId: true },
    });

    if (eligible.length === 0) {
      this.logger.log(
        `runUnreadNudges: ${perUser.size} candidates, 0 eligible after cooldown filter`,
      );
      return;
    }
    this.logger.log(
      `runUnreadNudges: ${perUser.size} candidates, sending to ${eligible.length}`,
    );

    for (const u of eligible) {
      const agg = perUser.get(u.id);
      if (!agg) continue; // shouldn't happen — both came from the same id set

      const tgId = Number(u.telegramId);
      const ageMin = Math.floor((now - agg.oldest.getTime()) / 60_000);
      const ageStr = formatAge(ageMin);
      const msgWord = plural(
        agg.count,
        "непрочитанное сообщение",
        "непрочитанных сообщения",
        "непрочитанных сообщений",
      );
      const chatWord = plural(agg.chats.size, "чате", "чатах", "чатах");
      const text =
        `💬 <b>У тебя ${agg.count} ${msgWord}</b>` +
        ` в ${agg.chats.size} ${chatWord} (давностью ${ageStr}).\n\n` +
        `Зайди и ответь, чтобы не теряться.`;
      try {
        await this.send(tgId, text, { parseMode: "HTML" });
        await this.prisma.user.update({
          where: { id: u.id },
          data: { lastUnreadNudgeAt: new Date() },
        });
      } catch (e) {
        this.logger.warn(
          `unread nudge failed for ${u.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
      await sleep(NUDGE_SEND_THROTTLE_MS);
    }
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

/** Tiny helper used by the per-recipient send loops to space out Bot
 *  API calls and stay under Telegram's 30 msg/sec global throughput. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Human-readable age string for the unread-nudge DM. Decides between
 *  minutes / hours / days based on magnitude so the message reads
 *  naturally ("давностью 2 ч" beats "давностью 120 мин"). */
function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  if (minutes < 60 * 24) {
    const h = Math.floor(minutes / 60);
    return `${h} ${plural(h, "час", "часа", "часов")}`;
  }
  const d = Math.floor(minutes / (60 * 24));
  return `${d} ${plural(d, "день", "дня", "дней")}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

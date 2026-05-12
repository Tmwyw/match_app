import type {
  AdminBanInput,
  AdminChatTranscript,
  AdminReport,
  AdminReportsResponse,
  AdminStats,
  AdminUserDetail,
  AdminUsersResponse,
  ReportResolution,
} from "@tg-app-meet/shared";
import type { Bot, Context } from "grammy";
import { InlineKeyboard, Keyboard } from "grammy";
import { env, isAdminTelegramId } from "./env.js";
import { prisma } from "./prisma.js";

/**
 * Admin console inside Telegram. The bot is the front-end; the API is the
 * source of truth (everything goes through HTTP /admin/* with ADMIN_TOKEN
 * as Bearer). Authorisation: the inbound Telegram user id must be in
 * ADMIN_TELEGRAM_IDS — otherwise we drop the request.
 *
 * State that doesn't fit in callback_data (search query input, pending ban
 * confirmation) is held in a tiny in-memory map keyed by Telegram id.
 */

// ─── HTTP client ────────────────────────────────────────────────────────────

class AdminApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${env.ADMIN_TOKEN}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${env.API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && body && "message" in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${res.status}`;
    throw new AdminApiError(res.status, msg);
  }
  return body as T;
}

const apiClient = {
  stats: () => adminFetch<AdminStats>("/admin/stats"),
  listUsers: (params: {
    q?: string;
    status?: string;
    take?: number;
    skip?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.status) qs.set("status", params.status);
    if (params.take != null) qs.set("take", String(params.take));
    if (params.skip != null) qs.set("skip", String(params.skip));
    const tail = qs.toString();
    return adminFetch<AdminUsersResponse>(
      `/admin/users${tail ? `?${tail}` : ""}`,
    );
  },
  userDetail: (id: string) =>
    adminFetch<AdminUserDetail>(`/admin/users/${id}`),
  ban: (id: string, body: AdminBanInput) =>
    adminFetch<AdminUserDetail>(`/admin/users/${id}/ban`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  unban: (id: string) =>
    adminFetch<AdminUserDetail>(`/admin/users/${id}/unban`, { method: "POST" }),
  hardDelete: (id: string) =>
    adminFetch<{ deletedId: string }>(`/admin/users/${id}/hard-delete`, {
      method: "POST",
    }),
  pendingProfiles: () =>
    adminFetch<AdminUsersResponse>("/admin/profiles/pending"),
  approveProfile: (id: string) =>
    adminFetch<AdminUserDetail>(`/admin/users/${id}/approve-profile`, {
      method: "POST",
    }),
  rejectProfile: (id: string) =>
    adminFetch<AdminUserDetail>(`/admin/users/${id}/reject-profile`, {
      method: "POST",
    }),
  reports: (includeResolved: boolean) =>
    adminFetch<AdminReportsResponse>(
      `/admin/reports?resolved=${includeResolved}`,
    ),
  resolveReport: (id: string, resolution: ReportResolution) =>
    adminFetch<AdminReport>(`/admin/reports/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution }),
    }),
  chatTranscript: (id: string) =>
    adminFetch<AdminChatTranscript>(`/admin/chats/${id}/messages`),
};

// ─── Reply-keyboard (persistent admin menu) ────────────────────────────────

// Button labels used for the persistent reply keyboard. The constants are
// also matched in bot.hears(...) so renaming here is enough to update both.
const BTN_STATS = "📊 Статистика";
const BTN_USERS = "👥 Пользователи";
const BTN_REPORTS = "🚨 Жалобы";
const BTN_PENDING = "📋 Модерация";
const BTN_BROADCAST = "📢 Рассылка";
const BTN_HIDE = "✕ Скрыть меню";

/** Build a fresh keyboard each call — grammy mutates internally otherwise.
 *  No .persistent() so Telegram exposes its native collapse chevron next
 *  to the chat input. Admins can hide the keyboard temporarily without
 *  fully closing it via the explicit "✕ Скрыть меню" button (which
 *  sends remove_keyboard). */
function adminReplyKeyboard(): Keyboard {
  return new Keyboard()
    .text(BTN_STATS)
    .row()
    .text(BTN_PENDING)
    .row()
    .text(BTN_USERS)
    .text(BTN_REPORTS)
    .row()
    .text(BTN_BROADCAST)
    .row()
    .text(BTN_HIDE)
    .resized();
}

// ─── Pending text input (search query / broadcast composition) ────────────

/** When a user clicks "🔍 Поиск", we set this so the next text message from
 *  them is treated as a search query instead of a normal user message. */
const awaitingSearch = new Set<bigint>();

/** When a user clicks "📢 Рассылка", their next text message becomes the
 *  broadcast body sent to every user with a telegramId. /cancel exits. */
const awaitingBroadcast = new Set<bigint>();

// ─── Renderers ──────────────────────────────────────────────────────────────

const PAGE = 8;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function backToMenuKb(): InlineKeyboard {
  return new InlineKeyboard().text("← Закрыть", "a:close");
}

function clearAwaiting(ctx: Context): void {
  const id = ctx.from?.id;
  if (!id) return;
  const bid = BigInt(id);
  awaitingSearch.delete(bid);
  awaitingBroadcast.delete(bid);
}

/**
 * Iterate every user with a telegramId and send `text` to each via the
 * bot API. We sleep ~50ms between sends to stay under Telegram's
 * 30 msg/sec throughput limit. Errors per recipient (blocked-bot, chat
 * not found) are counted and reported at the end — never propagated.
 */
async function runBroadcast(ctx: Context, text: string): Promise<void> {
  // Pull only what we need. Skip banned/deleted users — they shouldn't
  // get marketing pushes.
  // telegramId is required on User (every account is created via Telegram
  // auth) — no null-check needed. We just exclude banned/deleted.
  const recipients = await prisma.user.findMany({
    where: {
      bannedAt: null,
      deletedAt: null,
    },
    select: { id: true, telegramId: true },
  });
  if (recipients.length === 0) {
    await ctx.reply("Получателей нет.");
    return;
  }
  const startedAt = Date.now();
  await ctx.reply(`📢 Запускаю рассылку на <b>${recipients.length}</b> получателей…`, {
    parse_mode: "HTML",
  });
  let sent = 0;
  let failed = 0;
  for (const u of recipients) {
    try {
      await ctx.api.sendMessage(Number(u.telegramId), text, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
      sent += 1;
    } catch {
      failed += 1;
    }
    // Throttle below the 30 msg/sec global limit. ~22 msg/sec leaves
    // headroom for incidental other API calls (callback acks etc).
    await new Promise((r) => setTimeout(r, 45));
  }
  const dur = ((Date.now() - startedAt) / 1000).toFixed(1);
  await ctx.reply(
    `Готово за ${dur}s.\n· отправлено: <b>${sent}</b>\n· ошибок: ${failed}`,
    { parse_mode: "HTML" },
  );
}

function statsText(s: AdminStats): string {
  return [
    "<b>📊 Статистика</b>",
    "",
    "<b>Пользователи</b>",
    `всего: <b>${s.users.total}</b> · с ролью: ${s.users.withRole}`,
    `онлайн сейчас: <b>${s.users.onlineNow}</b>`,
    `баеры: ${s.users.buyers} · овнеры: ${s.users.owners}`,
    `забанены: ${s.users.banned} · удалены: ${s.users.deleted}`,
    `новых: ${s.users.new24h} (24ч) / ${s.users.new7d} (7д)`,
    "",
    "<b>Матчи</b>",
    `всего: ${s.matches.total} · 24ч: ${s.matches.last24h} · 7д: ${s.matches.last7d}`,
    "",
    "<b>Сообщения</b>",
    `всего: ${s.messages.total} · 24ч: ${s.messages.last24h}`,
    "",
    "<b>Жалобы</b>",
    `открытых: <b>${s.reports.open}</b> · решено: ${s.reports.resolved} · 7д: ${s.reports.last7d}`,
  ].join("\n");
}

function statsKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⟳ Обновить", "a:stats")
    .text("✕ Скрыть", "a:close");
}

function usersListText(data: AdminUsersResponse, skip: number, q?: string): string {
  const head = q
    ? `<b>👥 Пользователи — поиск "${escapeHtml(q)}"</b>`
    : "<b>👥 Пользователи</b>";
  if (data.rows.length === 0) {
    return `${head}\n\n(пусто)`;
  }
  const lines = [
    head,
    `всего ${data.total} · показаны ${skip + 1}–${skip + data.rows.length}`,
    "",
    ...data.rows.map((u, i) => {
      const tags = [];
      if (u.bannedAt) tags.push("🚫");
      if (u.deletedAt) tags.push("🗑");
      if (u.isOnline) tags.push("🟢");
      const tag = tags.length ? ` ${tags.join("")}` : "";
      const handle = u.username ? `@${u.username}` : "—";
      return `${skip + i + 1}. <b>${escapeHtml(u.anonId ?? "(нет роли)")}</b>${tag} · ${escapeHtml(handle)} · 🤝${u.counts.matches} · 🚨${u.counts.reportsAgainst}`;
    }),
  ];
  return lines.join("\n");
}

function usersListKb(
  data: AdminUsersResponse,
  skip: number,
  searchActive: boolean,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  // One button per row → opens that user. Anon id is the human label;
  // callback_data is the cuid.
  for (const u of data.rows) {
    kb.text(
      `${u.anonId ?? "(нет роли)"} · ${u.username ? `@${u.username}` : "—"}`,
      `a:user:${u.id}`,
    ).row();
  }
  if (skip > 0) {
    kb.text("← Назад", `a:users:${Math.max(0, skip - PAGE)}`);
  }
  if (skip + data.rows.length < data.total) {
    kb.text("Далее →", `a:users:${skip + PAGE}`);
  }
  kb.row();
  if (searchActive) {
    kb.text("✕ Сброс поиска", "a:users:0");
  } else {
    kb.text("🔍 Поиск", "a:search");
  }
  kb.text("✕ Скрыть", "a:close");
  return kb;
}

function userDetailText(u: AdminUserDetail): string {
  const tags = [];
  if (u.bannedAt) tags.push("🚫 ЗАБАНЕН");
  if (u.deletedAt) tags.push("🗑 УДАЛЁН");
  if (u.isOnline) tags.push("🟢 онлайн");
  const roleLabel =
    u.role === "BUYER" ? "БАЕР" : u.role === "OWNER" ? "ОВНЕР" : "—";

  const lines = [
    `<b>${escapeHtml(u.anonId ?? "(нет роли)")}</b> · ${roleLabel}${tags.length ? "\n" + tags.join(" · ") : ""}`,
    "",
    `id: <code>${u.id}</code>`,
    `tg: <code>${u.telegramId}</code>${u.username ? ` · @${escapeHtml(u.username)}` : ""}`,
    `создан: ${fmtDate(u.createdAt)} · был онлайн: ${fmtDateTime(u.lastSeenAt)}`,
    `🤝 матчей: ${u.counts.matches} · 💬 сообщений: ${u.counts.messages} · 🚨 жалоб: ${u.counts.reportsAgainst} · 🚫 блоков: ${u.counts.blocksAgainst}`,
  ];
  if (u.bannedAt) {
    lines.push(
      `забанен: ${fmtDateTime(u.bannedAt)} — ${escapeHtml(u.banReason ?? "без причины")}`,
    );
  }
  if (u.deletedAt) {
    lines.push(`удалён: ${fmtDateTime(u.deletedAt)}`);
  }
  if (u.buyerProfile) {
    lines.push(
      "",
      "<b>Анкета баера</b>",
      `вакансия: ${escapeHtml(u.buyerProfile.desiredPosition) || "—"}`,
      `трафик: ${u.buyerProfile.trafficSources.join(", ") || "—"}`,
      `вертикали: ${u.buyerProfile.verticals.join(", ") || "—"}`,
      `гео: ${u.buyerProfile.geos.join(", ") || "—"}`,
      `зп: $${u.buyerProfile.budgetMin}–${u.buyerProfile.budgetMax}`,
      `опыт: ${u.buyerProfile.experience} лет`,
    );
    if (u.buyerProfile.notes) {
      lines.push(`заметки: ${escapeHtml(u.buyerProfile.notes)}`);
    }
  }
  if (u.ownerProfile) {
    lines.push(
      "",
      "<b>Анкета овнера</b>",
      `нужен: ${escapeHtml(u.ownerProfile.offerName)}`,
      `трафик: ${u.ownerProfile.trafficSources.join(", ") || "—"}`,
      `вертикали: ${u.ownerProfile.verticals.join(", ") || "—"}`,
      `гео: ${u.ownerProfile.geos.join(", ") || "—"}`,
      `выплата: $${u.ownerProfile.payoutMin}–${u.ownerProfile.payoutMax}`,
    );
    if (u.ownerProfile.bio) lines.push(`о себе: ${escapeHtml(u.ownerProfile.bio)}`);
  }
  if (u.recentReportsAgainst.length > 0) {
    lines.push(
      "",
      `<b>Жалобы на пользователя (${u.recentReportsAgainst.length})</b>`,
    );
    for (const r of u.recentReportsAgainst.slice(0, 5)) {
      const resolution = r.resolution
        ? ` → ${translateResolution(r.resolution)}`
        : " (открыта)";
      lines.push(`· ${r.reason}${resolution} — ${fmtDate(r.createdAt)}`);
    }
  }
  return lines.join("\n");
}

/** "no_action" / "warned" / "banned" → readable Russian. */
function translateResolution(raw: string): string {
  if (raw === "no_action") return "без мер";
  if (raw === "warned") return "предупреждение";
  if (raw === "banned") return "бан";
  return raw;
}

function userDetailKb(u: AdminUserDetail): InlineKeyboard {
  const kb = new InlineKeyboard();
  // Pending profile (has a buyer/owner row but profileApprovedAt is null)
  // — surface approve/reject as the primary action.
  const isPending =
    u.profileApprovedAt == null &&
    (u.buyerProfile != null || u.ownerProfile != null);
  if (isPending) {
    kb.text("✅ Одобрить", `a:user:${u.id}:approve`)
      .text("✕ Отклонить", `a:user:${u.id}:askreject`)
      .row();
  }
  if (u.bannedAt) {
    kb.text("🟢 Разбанить", `a:user:${u.id}:unban`);
  } else if (!u.deletedAt) {
    kb.text("🚫 Забанить", `a:user:${u.id}:askban`);
  }
  kb.text("🗑 Удалить полностью", `a:user:${u.id}:askdelete`);
  kb.row();
  kb.text("⟳ Обновить", `a:user:${u.id}`);
  kb.text("← К списку", "a:users:0");
  return kb;
}

function confirmKb(yesData: string, noData: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Да", yesData)
    .text("✕ Отмена", noData);
}

function pendingListText(data: AdminUsersResponse): string {
  if (data.rows.length === 0) {
    return "<b>📋 Модерация</b>\n\n(очередь пуста)";
  }
  const lines = [
    `<b>📋 Модерация — ${data.total} в очереди</b>`,
    "Жми на анкету чтобы посмотреть детали и одобрить/отклонить.",
    "",
    ...data.rows.map((u, i) => {
      const handle = u.username ? `@${u.username}` : "—";
      const tag = u.role === "BUYER" ? "БАЕР" : u.role === "OWNER" ? "ОВНЕР" : "?";
      return `${i + 1}. <b>${escapeHtml(u.anonId ?? "(нет anonId)")}</b> · ${tag} · ${escapeHtml(handle)}`;
    }),
  ];
  return lines.join("\n");
}

function pendingListKb(data: AdminUsersResponse): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const u of data.rows) {
    kb.text(
      `${u.anonId ?? "(нет anonId)"} · ${u.username ? `@${u.username}` : "—"}`,
      `a:user:${u.id}`,
    ).row();
  }
  kb.text("⟳ Обновить", "a:pending").text("✕ Скрыть", "a:close");
  return kb;
}

function reportText(r: AdminReport): string {
  const lines = [
    `<b>🚨 Жалоба</b> · ${escapeHtml(r.reason)}`,
    `создана: ${fmtDateTime(r.createdAt)}`,
    "",
    `от кого: <b>${escapeHtml(r.reporterAnonId ?? "?")}</b>`,
    `на кого: <b>${escapeHtml(r.targetAnonId ?? "?")}</b>${r.targetUsername ? ` · @${escapeHtml(r.targetUsername)}` : ""}${r.targetBannedAt ? " 🚫" : ""}`,
  ];
  if (r.chatId) lines.push(`чат: <code>${r.chatId}</code>`);
  if (r.details) {
    lines.push("", "<i>детали:</i>", escapeHtml(r.details));
  }
  if (r.resolvedAt) {
    lines.push(
      "",
      `<b>решена</b> → ${translateResolution(r.resolution ?? "")} в ${fmtDateTime(r.resolvedAt)}`,
    );
  }
  return lines.join("\n");
}

function reportsListText(reports: AdminReportsResponse): string {
  if (reports.length === 0) return "<b>🚨 Жалобы</b>\n\n(пусто)";
  const lines = ["<b>🚨 Открытые жалобы</b>", ""];
  for (let i = 0; i < reports.length; i++) {
    const r = reports[i]!;
    lines.push(
      `${i + 1}. <b>${escapeHtml(r.reason)}</b> · ${escapeHtml(r.targetAnonId ?? "?")} ← ${escapeHtml(r.reporterAnonId ?? "?")}`,
    );
  }
  return lines.join("\n");
}

function reportsListKb(reports: AdminReportsResponse): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const r of reports) {
    kb.text(`${r.reason} · ${r.targetAnonId ?? "?"}`, `a:rep:${r.id}`).row();
  }
  kb.text("⟳ Обновить", "a:reports").text("✕ Скрыть", "a:close");
  return kb;
}

function reportDetailKb(r: AdminReport): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (!r.resolvedAt) {
    kb.text("⚪ Без мер", `a:rep:${r.id}:no_action`)
      .text("⚠ Предупредить", `a:rep:${r.id}:warned`)
      .text("🚫 Бан", `a:rep:${r.id}:banned`)
      .row();
  }
  if (r.targetUserId) {
    kb.text("👤 Открыть пользователя", `a:user:${r.targetUserId}`).row();
  }
  kb.text("← К списку", "a:reports");
  return kb;
}

// ─── Wiring ─────────────────────────────────────────────────────────────────

/**
 * Mounts the /admin command + callback handler + the text catcher used for
 * the search-query flow. Call once during bot bootstrap.
 */
export function registerAdminHandlers(bot: Bot): void {
  const guard = (ctx: Context): boolean => {
    const id = ctx.from?.id;
    return !!id && isAdminTelegramId(id);
  };

  bot.command("admin", async (ctx) => {
    if (!guard(ctx)) {
      await ctx.reply("¯\\_(ツ)_/¯");
      return;
    }
    await ctx.reply(
      "<b>CREO Metrics · admin</b>\n\nВыбери действие в меню снизу.",
      {
        parse_mode: "HTML",
        reply_markup: adminReplyKeyboard(),
      },
    );
  });

  // ─── Reply-keyboard button handlers ──────────────────────────────────────
  // Each button sends its label as a normal message; bot.hears() matches.
  // Registered BEFORE bot.on("message:text") so the catch-all (search /
  // broadcast) doesn't swallow these.

  bot.hears(BTN_STATS, async (ctx) => {
    if (!guard(ctx)) return;
    clearAwaiting(ctx);
    try {
      const s = await apiClient.stats();
      await ctx.reply(statsText(s), { parse_mode: "HTML" });
    } catch (e) {
      await ctx.reply(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  bot.hears(BTN_USERS, async (ctx) => {
    if (!guard(ctx)) return;
    clearAwaiting(ctx);
    try {
      const list = await apiClient.listUsers({ take: PAGE, skip: 0 });
      await ctx.reply(usersListText(list, 0), {
        parse_mode: "HTML",
        // Inline kb stays on the message for pagination + per-user drill-down.
        reply_markup: usersListKb(list, 0, false),
      });
    } catch (e) {
      await ctx.reply(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  bot.hears(BTN_REPORTS, async (ctx) => {
    if (!guard(ctx)) return;
    clearAwaiting(ctx);
    try {
      const reports = await apiClient.reports(false);
      await ctx.reply(reportsListText(reports), {
        parse_mode: "HTML",
        reply_markup: reportsListKb(reports),
      });
    } catch (e) {
      await ctx.reply(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  bot.hears(BTN_PENDING, async (ctx) => {
    if (!guard(ctx)) return;
    clearAwaiting(ctx);
    try {
      const list = await apiClient.pendingProfiles();
      await ctx.reply(pendingListText(list), {
        parse_mode: "HTML",
        reply_markup: pendingListKb(list),
      });
    } catch (e) {
      await ctx.reply(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  bot.hears(BTN_BROADCAST, async (ctx) => {
    if (!guard(ctx)) return;
    const id = ctx.from?.id;
    if (id) {
      awaitingSearch.delete(BigInt(id));
      awaitingBroadcast.add(BigInt(id));
    }
    await ctx.reply(
      "📢 Отправь текст рассылки одним сообщением. /cancel — отмена.\n\n" +
        "<i>HTML поддерживается. Сообщение уйдёт всем пользователям с привязанным telegramId.</i>",
      { parse_mode: "HTML" },
    );
  });

  bot.hears(BTN_HIDE, async (ctx) => {
    if (!guard(ctx)) return;
    clearAwaiting(ctx);
    await ctx.reply("Меню скрыто. /admin откроет снова.", {
      reply_markup: { remove_keyboard: true },
    });
  });

  // Text-message catcher for the search/broadcast flows. Runs AFTER hears()
  // (grammy dispatches in registration order), so it only sees messages
  // that aren't menu-button taps.
  bot.on("message:text", async (ctx, next) => {
    const id = ctx.from?.id;
    if (!id || !guard(ctx)) return next();
    const bid = BigInt(id);

    if (awaitingBroadcast.has(bid)) {
      awaitingBroadcast.delete(bid);
      const text = ctx.message.text;
      if (text === "/cancel") {
        await ctx.reply("Рассылка отменена.");
        return;
      }
      await runBroadcast(ctx, text);
      return;
    }

    if (awaitingSearch.has(bid)) {
      awaitingSearch.delete(bid);
      const q = ctx.message.text.trim();
      if (q === "/cancel" || q === "" || q.startsWith("/")) {
        await ctx.reply("Поиск отменён.");
        return;
      }
      try {
        const data = await apiClient.listUsers({ q, take: PAGE, skip: 0 });
        await ctx.reply(usersListText(data, 0, q), {
          parse_mode: "HTML",
          reply_markup: usersListKb(data, 0, true),
        });
      } catch (e) {
        await ctx.reply(`error: ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }

    return next();
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("a:")) return next();
    if (!guard(ctx)) {
      await ctx.answerCallbackQuery({ text: "Нет доступа" });
      return;
    }
    try {
      await dispatch(ctx, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx
        .answerCallbackQuery({ text: `error: ${msg.slice(0, 180)}`, show_alert: true })
        .catch(() => {});
    }
  });
}

async function dispatch(ctx: Context, data: string): Promise<void> {
  // Always ack the callback so the spinner stops; we'll edit the message
  // (or send a new one) below.
  await ctx.answerCallbackQuery().catch(() => {});

  if (data === "a:close" || data === "a:menu") {
    // Reply keyboard at the bottom IS the main menu now — `a:close` and
    // `a:menu` both just dismiss this inline message. Reply keyboard
    // stays visible.
    await ctx.deleteMessage().catch(() => {});
    return;
  }

  if (data === "a:stats") {
    const s = await apiClient.stats();
    await ctx.editMessageText(statsText(s), {
      parse_mode: "HTML",
      reply_markup: statsKb(),
    });
    return;
  }

  if (data.startsWith("a:users:")) {
    const skip = Number(data.slice("a:users:".length)) || 0;
    const list = await apiClient.listUsers({ take: PAGE, skip });
    await ctx.editMessageText(usersListText(list, skip), {
      parse_mode: "HTML",
      reply_markup: usersListKb(list, skip, false),
    });
    return;
  }

  if (data === "a:search") {
    const id = ctx.from?.id;
    if (id) awaitingSearch.add(BigInt(id));
    await ctx.editMessageText(
      "🔍 Отправь текст для поиска (anonId / @username / id / tg id), или /cancel.",
      { reply_markup: backToMenuKb() },
    );
    return;
  }

  if (data.startsWith("a:user:")) {
    const rest = data.slice("a:user:".length);
    const [id, action] = rest.split(":");
    if (!id) return;

    if (!action) {
      const u = await apiClient.userDetail(id);
      await ctx.editMessageText(userDetailText(u), {
        parse_mode: "HTML",
        reply_markup: userDetailKb(u),
      });
      return;
    }
    if (action === "askban") {
      await ctx.editMessageText(`Забанить пользователя <code>${id}</code>?`, {
        parse_mode: "HTML",
        reply_markup: confirmKb(`a:user:${id}:ban`, `a:user:${id}`),
      });
      return;
    }
    if (action === "ban") {
      const reason = `via bot by ${ctx.from?.username ? "@" + ctx.from.username : ctx.from?.id ?? "admin"}`;
      const u = await apiClient.ban(id, { reason });
      await ctx.editMessageText(userDetailText(u), {
        parse_mode: "HTML",
        reply_markup: userDetailKb(u),
      });
      return;
    }
    if (action === "unban") {
      const u = await apiClient.unban(id);
      await ctx.editMessageText(userDetailText(u), {
        parse_mode: "HTML",
        reply_markup: userDetailKb(u),
      });
      return;
    }
    if (action === "askdelete") {
      await ctx.editMessageText(
        `🗑 <b>Полностью удалить</b> пользователя <code>${id}</code>?\n\n` +
          "Удалятся анкета, все матчи, чаты, сообщения, свайпы, " +
          "жалобы и блоки. Восстановить нельзя. При следующем входе " +
          "через Telegram создастся новый аккаунт с нуля.",
        {
          parse_mode: "HTML",
          reply_markup: confirmKb(
            `a:user:${id}:delete`,
            `a:user:${id}`,
          ),
        },
      );
      return;
    }
    if (action === "delete") {
      await apiClient.hardDelete(id);
      // User no longer exists — no detail to fetch. Show success +
      // back-to-list button.
      await ctx.editMessageText(
        `✅ Пользователь <code>${id}</code> удалён полностью.`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("← К списку", "a:users:0")
            .text("✕ Скрыть", "a:close"),
        },
      );
      return;
    }
    if (action === "approve") {
      const u = await apiClient.approveProfile(id);
      await ctx.editMessageText(userDetailText(u), {
        parse_mode: "HTML",
        reply_markup: userDetailKb(u),
      });
      return;
    }
    if (action === "askreject") {
      await ctx.editMessageText(
        `Отклонить заявку <code>${id}</code>?\n\nПрофиль и роль будут удалены — пользователь окажется на экране выбора роли.`,
        {
          parse_mode: "HTML",
          reply_markup: confirmKb(`a:user:${id}:reject`, `a:user:${id}`),
        },
      );
      return;
    }
    if (action === "reject") {
      const u = await apiClient.rejectProfile(id);
      await ctx.editMessageText(userDetailText(u), {
        parse_mode: "HTML",
        reply_markup: userDetailKb(u),
      });
      return;
    }
  }

  if (data === "a:pending") {
    const list = await apiClient.pendingProfiles();
    await ctx.editMessageText(pendingListText(list), {
      parse_mode: "HTML",
      reply_markup: pendingListKb(list),
    });
    return;
  }

  if (data === "a:reports") {
    const reports = await apiClient.reports(false);
    await ctx.editMessageText(reportsListText(reports), {
      parse_mode: "HTML",
      reply_markup: reportsListKb(reports),
    });
    return;
  }

  if (data.startsWith("a:rep:")) {
    const rest = data.slice("a:rep:".length);
    const parts = rest.split(":");
    const [id, action] = parts;
    if (!id) return;

    if (action === "no_action" || action === "warned" || action === "banned") {
      const r = await apiClient.resolveReport(id, action as ReportResolution);
      await ctx.editMessageText(reportText(r), {
        parse_mode: "HTML",
        reply_markup: reportDetailKb(r),
      });
      return;
    }
    // No action suffix → show report detail. Need to fetch from list since
    // /admin/reports/:id GET doesn't exist; iterate the cached list.
    const reports = await apiClient.reports(true);
    const r = reports.find((x) => x.id === id);
    if (!r) {
      await ctx.editMessageText("Жалоба не найдена.", {
        reply_markup: backToMenuKb(),
      });
      return;
    }
    await ctx.editMessageText(reportText(r), {
      parse_mode: "HTML",
      reply_markup: reportDetailKb(r),
    });
    return;
  }
}

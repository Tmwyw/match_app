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
import { InlineKeyboard } from "grammy";
import { env, isAdminTelegramId } from "./env.js";

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
  resetRole: (id: string) =>
    adminFetch<AdminUserDetail>(`/admin/users/${id}/reset-role`, {
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

// ─── Pending text input (search query) ──────────────────────────────────────

/** When a user clicks "🔍 Поиск", we set this so the next text message from
 *  them is treated as a search query instead of a normal user message. */
const awaitingSearch = new Set<bigint>();

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

function mainMenuKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📊 Stats", "a:stats")
    .row()
    .text("👥 Users", "a:users:0")
    .row()
    .text("🚨 Reports", "a:reports")
    .row()
    .text("✕ Закрыть", "a:close");
}

function backToMenuKb(): InlineKeyboard {
  return new InlineKeyboard().text("← В меню", "a:menu");
}

function statsText(s: AdminStats): string {
  return [
    "<b>📊 Stats</b>",
    "",
    "<b>users</b>",
    `total: <b>${s.users.total}</b> · with role: ${s.users.withRole}`,
    `online now: <b>${s.users.onlineNow}</b>`,
    `buyers: ${s.users.buyers} · owners: ${s.users.owners}`,
    `banned: ${s.users.banned} · deleted: ${s.users.deleted}`,
    `new: ${s.users.new24h} (24h) / ${s.users.new7d} (7d)`,
    "",
    "<b>matches</b>",
    `total: ${s.matches.total} · 24h: ${s.matches.last24h} · 7d: ${s.matches.last7d}`,
    "",
    "<b>messages</b>",
    `total: ${s.messages.total} · 24h: ${s.messages.last24h}`,
    "",
    "<b>reports</b>",
    `open: <b>${s.reports.open}</b> · resolved: ${s.reports.resolved} · 7d: ${s.reports.last7d}`,
  ].join("\n");
}

function statsKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⟳ Refresh", "a:stats")
    .text("← В меню", "a:menu");
}

function usersListText(data: AdminUsersResponse, skip: number, q?: string): string {
  const head = q
    ? `<b>👥 Users — поиск "${escapeHtml(q)}"</b>`
    : "<b>👥 Users</b>";
  if (data.rows.length === 0) {
    return `${head}\n\n(пусто)`;
  }
  const lines = [
    head,
    `${data.total} total · ${skip + 1}–${skip + data.rows.length}`,
    "",
    ...data.rows.map((u, i) => {
      const tags = [];
      if (u.bannedAt) tags.push("🚫");
      if (u.deletedAt) tags.push("🗑");
      if (u.isOnline) tags.push("🟢");
      const tag = tags.length ? ` ${tags.join("")}` : "";
      const handle = u.username ? `@${u.username}` : "—";
      return `${skip + i + 1}. <b>${escapeHtml(u.anonId ?? "(no role)")}</b>${tag} · ${escapeHtml(handle)} · M:${u.counts.matches} R:${u.counts.reportsAgainst}`;
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
      `${u.anonId ?? "(no role)"} · ${u.username ? `@${u.username}` : "—"}`,
      `a:user:${u.id}`,
    ).row();
  }
  if (skip > 0) {
    kb.text("← Prev", `a:users:${Math.max(0, skip - PAGE)}`);
  }
  if (skip + data.rows.length < data.total) {
    kb.text("Next →", `a:users:${skip + PAGE}`);
  }
  kb.row();
  if (searchActive) {
    kb.text("✕ Сброс поиска", "a:users:0");
  } else {
    kb.text("🔍 Поиск", "a:search");
  }
  kb.text("← В меню", "a:menu");
  return kb;
}

function userDetailText(u: AdminUserDetail): string {
  const tags = [];
  if (u.bannedAt) tags.push("🚫 BANNED");
  if (u.deletedAt) tags.push("🗑 DELETED");
  if (u.isOnline) tags.push("🟢 online");

  const lines = [
    `<b>${escapeHtml(u.anonId ?? "(no role)")}</b> · ${u.role ?? "—"}${tags.length ? "\n" + tags.join(" · ") : ""}`,
    "",
    `id: <code>${u.id}</code>`,
    `tg: <code>${u.telegramId}</code>${u.username ? ` · @${escapeHtml(u.username)}` : ""}`,
    `created: ${fmtDate(u.createdAt)} · last seen: ${fmtDateTime(u.lastSeenAt)}`,
    `M:${u.counts.matches} · Msg:${u.counts.messages} · R:${u.counts.reportsAgainst} · B:${u.counts.blocksAgainst}`,
  ];
  if (u.bannedAt) {
    lines.push(`banned: ${fmtDateTime(u.bannedAt)} — ${escapeHtml(u.banReason ?? "no reason")}`);
  }
  if (u.deletedAt) {
    lines.push(`deleted: ${fmtDateTime(u.deletedAt)}`);
  }
  if (u.buyerProfile) {
    lines.push(
      "",
      "<b>Buyer profile</b>",
      `position: ${escapeHtml(u.buyerProfile.desiredPosition) || "—"}`,
      `traffic: ${u.buyerProfile.trafficSources.join(", ") || "—"}`,
      `verticals: ${u.buyerProfile.verticals.join(", ") || "—"}`,
      `geos: ${u.buyerProfile.geos.join(", ") || "—"}`,
      `salary: $${u.buyerProfile.budgetMin}–${u.buyerProfile.budgetMax}`,
      `experience: ${u.buyerProfile.experience}`,
    );
    if (u.buyerProfile.notes) {
      lines.push(`notes: ${escapeHtml(u.buyerProfile.notes)}`);
    }
  }
  if (u.ownerProfile) {
    lines.push(
      "",
      "<b>Owner profile</b>",
      `offer (нужен): ${escapeHtml(u.ownerProfile.offerName)}`,
      `traffic: ${u.ownerProfile.trafficSources.join(", ") || "—"}`,
      `verticals: ${u.ownerProfile.verticals.join(", ") || "—"}`,
      `geos: ${u.ownerProfile.geos.join(", ") || "—"}`,
      `payout: $${u.ownerProfile.payoutMin}–${u.ownerProfile.payoutMax}`,
    );
    if (u.ownerProfile.bio) lines.push(`bio: ${escapeHtml(u.ownerProfile.bio)}`);
  }
  if (u.recentReportsAgainst.length > 0) {
    lines.push("", `<b>Reports against (${u.recentReportsAgainst.length})</b>`);
    for (const r of u.recentReportsAgainst.slice(0, 5)) {
      const resolution = r.resolution ? ` → ${r.resolution}` : " (open)";
      lines.push(`· ${r.reason}${resolution} — ${fmtDate(r.createdAt)}`);
    }
  }
  return lines.join("\n");
}

function userDetailKb(u: AdminUserDetail): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (u.bannedAt) {
    kb.text("🟢 Unban", `a:user:${u.id}:unban`);
  } else if (!u.deletedAt) {
    kb.text("🚫 Ban", `a:user:${u.id}:askban`);
  }
  kb.text("🔄 Reset role", `a:user:${u.id}:askreset`);
  kb.row();
  kb.text("⟳ Refresh", `a:user:${u.id}`);
  kb.text("← К списку", "a:users:0");
  return kb;
}

function confirmKb(yesData: string, noData: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Да", yesData)
    .text("✕ Отмена", noData);
}

function reportText(r: AdminReport): string {
  const lines = [
    `<b>🚨 Report</b> · ${escapeHtml(r.reason)}`,
    `created: ${fmtDateTime(r.createdAt)}`,
    "",
    `from: <b>${escapeHtml(r.reporterAnonId ?? "?")}</b>`,
    `target: <b>${escapeHtml(r.targetAnonId ?? "?")}</b>${r.targetUsername ? ` · @${escapeHtml(r.targetUsername)}` : ""}${r.targetBannedAt ? " 🚫" : ""}`,
  ];
  if (r.chatId) lines.push(`chat: <code>${r.chatId}</code>`);
  if (r.details) {
    lines.push("", "<i>details:</i>", escapeHtml(r.details));
  }
  if (r.resolvedAt) {
    lines.push("", `<b>resolved</b> → ${r.resolution} at ${fmtDateTime(r.resolvedAt)}`);
  }
  return lines.join("\n");
}

function reportsListText(reports: AdminReportsResponse): string {
  if (reports.length === 0) return "<b>🚨 Reports</b>\n\n(пусто)";
  const lines = ["<b>🚨 Open reports</b>", ""];
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
  kb.text("⟳ Refresh", "a:reports").text("← В меню", "a:menu");
  return kb;
}

function reportDetailKb(r: AdminReport): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (!r.resolvedAt) {
    kb.text("⚪ no action", `a:rep:${r.id}:no_action`)
      .text("⚠ warned", `a:rep:${r.id}:warned`)
      .text("🚫 ban", `a:rep:${r.id}:banned`)
      .row();
  }
  if (r.targetUserId) {
    kb.text("👤 target", `a:user:${r.targetUserId}`).row();
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
    await ctx.reply("<b>tg-meet · admin</b>", {
      parse_mode: "HTML",
      reply_markup: mainMenuKb(),
    });
  });

  // Text-message catcher for the search flow. Runs BEFORE other text handlers
  // because grammy dispatches in registration order.
  bot.on("message:text", async (ctx, next) => {
    const id = ctx.from?.id;
    if (!id || !guard(ctx) || !awaitingSearch.has(BigInt(id))) {
      return next();
    }
    awaitingSearch.delete(BigInt(id));
    const q = ctx.message.text.trim();
    if (q === "/cancel" || q === "" || q.startsWith("/")) {
      await ctx.reply("Поиск отменён.", { reply_markup: backToMenuKb() });
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

  if (data === "a:close") {
    await ctx.deleteMessage().catch(() => {});
    return;
  }

  if (data === "a:menu") {
    await ctx.editMessageText("<b>tg-meet · admin</b>", {
      parse_mode: "HTML",
      reply_markup: mainMenuKb(),
    });
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
    if (action === "askreset") {
      await ctx.editMessageText(
        `Сбросить роль и удалить профиль у <code>${id}</code>?\n\nМатчи и чаты останутся, anonId изменится после переонбординга.`,
        {
          parse_mode: "HTML",
          reply_markup: confirmKb(`a:user:${id}:reset`, `a:user:${id}`),
        },
      );
      return;
    }
    if (action === "reset") {
      const u = await apiClient.resetRole(id);
      await ctx.editMessageText(userDetailText(u), {
        parse_mode: "HTML",
        reply_markup: userDetailKb(u),
      });
      return;
    }
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
      await ctx.editMessageText("Report не найден.", {
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

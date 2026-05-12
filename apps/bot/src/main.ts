import { Bot, type Context, InlineKeyboard } from "grammy";
// Explicit .js extensions: bot is `"type": "module"` and tsc preserves
// the import paths verbatim, so Node ESM at runtime needs the real file
// extension. Dev (tsx) is fine without — only prod (`node dist/main.js`) breaks.
import { registerAdminHandlers } from "./admin.js";
import { env } from "./env.js";
import { prisma } from "./prisma.js";
import { handleStartPayload } from "./start-payload.js";

const bot = new Bot(env.BOT_TOKEN);

// Mount /admin BEFORE the catch-all message handlers so its text-input flow
// (search query) gets first dibs on incoming messages from admins.
registerAdminHandlers(bot);

// Both welcome copies point at the synthesized Mini App launcher: the
// blue "Open App" tile pinned to the input bar (left of the message
// field). Mentioning it by name + colour beats a vague "кнопка 👇"
// because on some clients the persistent menu button sits beside (not
// under) the message — the down-arrow emoji misled users.
const FIRST_TIME_WELCOME =
  "👋 <b>Добро пожаловать в CREO Metrics</b>\n\n" +
  "Это B2B-площадка для арбитражных команд: баеры и владельцы офферов " +
  "находят друг друга по интересам и общаются анонимно, пока обе стороны " +
  "не согласятся раскрыть контакты.\n\n" +
  "Нажми синюю кнопку <b>Open App</b> внизу слева — заполни анкету и приступай к поиску.";

const RETURN_WELCOME =
  "С возвращением в <b>CREO Metrics</b>!\n\n" +
  "Нажми синюю кнопку <b>Open App</b> внизу слева, чтобы открыть приложение.";

const SUPPORT_TG_URL = "https://t.me/creometrics";

/**
 * Legacy reply-keyboard label kept here so users whose Telegram still
 * has the old "🤝 Поддержка" keyboard cached from a previous bot
 * version still hit the support handler when they tap it. The keyboard
 * itself is no longer pinned on new /start — the welcome's inline
 * Поддержка button + the chat menu button cover everything. Safe to
 * delete once the cached keyboards age out naturally.
 */
const USER_BTN_SUPPORT = "🤝 Поддержка";

/** Shared body of the "support" reply — used by /support, by the
 *  inline Поддержка button in welcome, and as the fallback for old
 *  reply-keyboard taps. */
async function sendSupportReply(ctx: Context): Promise<void> {
  const kb = new InlineKeyboard().url("🤝 Открыть поддержку", SUPPORT_TG_URL);
  await ctx.reply(
    "🤝 <b>Поддержка CREO Metrics</b>\n\nЕсли возникли вопросы или нужна " +
      "помощь — пиши нам в Telegram, ответим в рабочие часы.",
    { parse_mode: "HTML", reply_markup: kb },
  );
}

bot.command("start", async (ctx) => {
  // ctx.match is everything after "/start " (empty string when no payload).
  const payload = (ctx.match as string | undefined)?.trim();
  if (ctx.from && payload) {
    try {
      await handleStartPayload(ctx.from.id, ctx.from.username ?? null, payload);
    } catch (e) {
      // Persistence failure should not break the welcome flow — the user
      // can still open the Mini App; deep-link state just won't apply.
      console.warn("[bot] start payload persist failed:", e);
    }
  }

  // First-time vs returning detection. We treat "has a role" as the signal
  // for "real user who's been through onboarding" — a row with role=null
  // can be a fresh stub from a referral deep-link or a literal first /start
  // and should still see the elaborate welcome.
  let isReturning = false;
  if (ctx.from) {
    try {
      const u = await prisma.user.findUnique({
        where: { telegramId: BigInt(ctx.from.id) },
        select: { role: true },
      });
      isReturning = u?.role != null;
    } catch (e) {
      // DB lookup failure → fall through to the first-time copy. Safer to
      // over-explain than to silently truncate a real first-time greeting.
      console.warn("[bot] /start lookup failed:", e);
    }
  }

  // For users coming from previous bot versions, send remove_keyboard
  // FIRST as a separate quiet "·" message — clears the legacy "🤝
  // Поддержка" reply keyboard. Then send the actual welcome with the
  // inline-only kb. New users / users without a cached keyboard see
  // this as a tiny no-op dot above the welcome; we accept that minor
  // noise once-per-/start because the alternative (a permanent stale
  // reply tile) is uglier.
  try {
    const ack = await ctx.reply("·", { reply_markup: { remove_keyboard: true } });
    // Best-effort delete so the dot doesn't linger. Some clients reject
    // immediate self-delete; that's fine.
    await ctx.api.deleteMessage(ack.chat.id, ack.message_id).catch(() => {});
  } catch {
    /* old client without remove_keyboard support — keyboard stays */
  }

  // Only the Support link in the welcome — the "Open App" entry is
  // handled by the chat's persistent menu button (left of the input).
  // No reply keyboard pinned, no follow-up "menu always available"
  // message — chat history stays clean.
  const kb = new InlineKeyboard().url("🤝 Поддержка", SUPPORT_TG_URL);
  await ctx.reply(isReturning ? RETURN_WELCOME : FIRST_TIME_WELCOME, {
    parse_mode: "HTML",
    reply_markup: kb,
  });
});

// Legacy reply-keyboard "🤝 Поддержка" tap. Telegram reply-keyboard
// buttons can't carry a URL action natively — they only send text.
// So we respond with the bare manager URL: Telegram auto-renders a
// tappable contact preview (avatar, name, "open chat") that takes
// the user straight to @creometrics in one tap. Also clears the
// stale keyboard via remove_keyboard so they don't see this button
// again on next interaction.
bot.hears(USER_BTN_SUPPORT, async (ctx) => {
  await ctx.reply(SUPPORT_TG_URL, {
    reply_markup: { remove_keyboard: true },
  });
});

bot.command("help", (ctx) =>
  ctx.reply("Команды:\n/start — открыть приложение\n/support — связаться с нами")
);

bot.command("support", sendSupportReply);

// Reset menu commands once on boot. /admin is shown only to whitelisted
// Telegram IDs via Bot API scope.
async function setupCommands() {
  try {
    await bot.api.setMyCommands(
      [
        { command: "start", description: "Открыть приложение" },
        { command: "support", description: "🤝 Поддержка" },
        { command: "help", description: "Помощь" },
      ],
      { scope: { type: "default" } },
    );
    if (env.ADMIN_TELEGRAM_IDS.length > 0) {
      for (const tgId of env.ADMIN_TELEGRAM_IDS) {
        try {
          await bot.api.setMyCommands(
            [
              { command: "start", description: "Открыть приложение" },
              { command: "support", description: "🤝 Поддержка" },
              { command: "admin", description: "Админ-консоль" },
            ],
            { scope: { type: "chat", chat_id: Number(tgId) } },
          );
        } catch (e) {
          // chat scope only works after the user has interacted with the bot.
          // Failing here is fine — they'll still see /admin if they type it.
          console.warn(
            `[bot] could not set admin scope for ${tgId}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
  } catch (e) {
    console.warn(
      `[bot] failed to set commands: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

bot.catch((err) => {
  console.error("[bot] error", err);
});

/**
 * Set the bot's public profile metadata (name shown in chat header,
 * short description on the bot's @username page, long description shown
 * before the user clicks "Start"). Telegram caches these aggressively
 * on clients — first launch after a token swap may still show defaults
 * for a few minutes. Re-applied on every boot so a fresh bot picks up
 * the brand without manual BotFather poking.
 *
 * Avatar/picture CANNOT be set via Bot API — that's BotFather only.
 * Go to @BotFather → /setuserpic → upload the CREO Metrics logo.
 */
const BOT_DISPLAY_NAME = "CREO Metrics";
const BOT_SHORT_DESCRIPTION =
  "B2B-площадка для арбитражных команд: баеры и владельцы офферов находят друг друга и общаются анонимно.";
const BOT_DESCRIPTION =
  "CREO Metrics — это B2B-площадка для арбитражных команд.\n\n" +
  "Баеры и владельцы офферов находят друг друга по интересам, свайпают анкеты " +
  "и общаются анонимно, пока обе стороны не согласятся раскрыть контакты.\n\n" +
  "Жми Start и заполни анкету 👇";

async function setupBotProfile() {
  // setMyName / setMyDescription / setMyShortDescription are no-ops when
  // the current value already matches — safe to call on every boot.
  // Each is wrapped separately so one transient 429/timeout doesn't skip
  // the others.
  try {
    await bot.api.setMyName(BOT_DISPLAY_NAME);
  } catch (e) {
    console.warn(
      `[bot] setMyName failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  try {
    await bot.api.setMyShortDescription(BOT_SHORT_DESCRIPTION);
  } catch (e) {
    console.warn(
      `[bot] setMyShortDescription failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  try {
    await bot.api.setMyDescription(BOT_DESCRIPTION);
  } catch (e) {
    console.warn(
      `[bot] setMyDescription failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  console.log(`[bot] profile metadata applied (name="${BOT_DISPLAY_NAME}")`);
}

/**
 * Pin the Mini App as the persistent menu button next to the chat input.
 * Without this, every user sees the default "Menu" → command list. With it,
 * the input bar shows a one-tap "Open App" button. Set globally (no chat_id)
 * — applies as the default for every user who hasn't customised theirs.
 *
 * Re-applied on every boot because the URL changes in dev (cloudflared).
 */
async function setupMenuButton() {
  try {
    await bot.api.setChatMenuButton({
      menu_button: {
        type: "web_app",
        text: "Open App",
        web_app: { url: env.WEB_APP_URL },
      },
    });
    console.log(`[bot] menu button → ${env.WEB_APP_URL}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[bot] failed to set menu button: ${msg}`);
  }
}

console.log("[bot] starting long-polling…");
bot.start({
  onStart: async (me) => {
    console.log(`[bot] @${me.username} ready (web app → ${env.WEB_APP_URL})`);
    await setupBotProfile();
    await setupMenuButton();
    await setupCommands();
    if (env.ADMIN_TELEGRAM_IDS.length > 0) {
      console.log(
        `[bot] admin enabled for ${env.ADMIN_TELEGRAM_IDS.length} telegram id(s)`,
      );
    } else {
      console.log("[bot] admin disabled (ADMIN_TELEGRAM_IDS empty)");
    }
  },
});

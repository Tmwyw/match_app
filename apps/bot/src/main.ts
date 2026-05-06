import { Bot, InlineKeyboard } from "grammy";
import { registerAdminHandlers } from "./admin";
import { env } from "./env";
import { handleStartPayload } from "./start-payload";

const bot = new Bot(env.BOT_TOKEN);

// Mount /admin BEFORE the catch-all message handlers so its text-input flow
// (search query) gets first dibs on incoming messages from admins.
registerAdminHandlers(bot);

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
  const kb = new InlineKeyboard().webApp("Открыть приложение", env.WEB_APP_URL);
  await ctx.reply(
    "👋 Это TG Meet — мэтчинг баеров и овнеров.\nЖми кнопку, чтобы открыть приложение.",
    { reply_markup: kb }
  );
});

bot.command("help", (ctx) =>
  ctx.reply("Команды:\n/start — открыть приложение")
);

// Reset menu commands once on boot. /admin is shown only to whitelisted
// Telegram IDs via Bot API scope.
async function setupCommands() {
  try {
    await bot.api.setMyCommands(
      [
        { command: "start", description: "Открыть приложение" },
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

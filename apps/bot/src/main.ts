import { Bot, InlineKeyboard } from "grammy";
import { env } from "./env";

const bot = new Bot(env.BOT_TOKEN);

bot.command("start", async (ctx) => {
  const kb = new InlineKeyboard().webApp("Открыть приложение", env.WEB_APP_URL);
  await ctx.reply(
    "👋 Это TG Meet — мэтчинг баеров и овнеров.\nЖми кнопку, чтобы открыть приложение.",
    { reply_markup: kb }
  );
});

bot.command("help", (ctx) =>
  ctx.reply("Команды:\n/start — открыть приложение")
);

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
  },
});

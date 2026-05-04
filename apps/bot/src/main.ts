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

console.log("[bot] starting long-polling…");
bot.start({
  onStart: (me) => console.log(`[bot] @${me.username} ready (web app → ${env.WEB_APP_URL})`),
});

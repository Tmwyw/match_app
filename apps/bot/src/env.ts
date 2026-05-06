import { z } from "zod";

const Env = z.object({
  BOT_TOKEN: z.string().min(20, "BOT_TOKEN missing — get one from @BotFather"),
  WEB_APP_URL: z.string().url(),
  // Required so the bot can persist deep-link payloads (referrals, profile
  // views) directly to the same Postgres the API uses. Bot writes to a
  // small whitelist of User columns; auth.service consumes them on login.
  DATABASE_URL: z.string().min(1),
  // Where the bot's /admin command sends HTTP calls. In dev: localhost:3001;
  // in prod docker-compose: http://api:3001 (service name).
  API_URL: z.string().url().default("http://localhost:3001"),
  // Same token the web admin uses (env.ADMIN_TOKEN on the API side). Bot
  // attaches it as Bearer on every /admin/* call.
  ADMIN_TOKEN: z.string().min(16),
  // Comma-separated Telegram IDs allowed to use /admin. Anyone else gets
  // a polite refusal. Empty = no one (bot still boots, /admin is locked).
  ADMIN_TELEGRAM_IDS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => BigInt(p)),
    ),
});

export const env = (() => {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    console.error("[bot] invalid env:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
})();

export function isAdminTelegramId(id: number | bigint): boolean {
  const big = typeof id === "bigint" ? id : BigInt(id);
  return env.ADMIN_TELEGRAM_IDS.some((a) => a === big);
}

import { z } from "zod";

const Env = z.object({
  BOT_TOKEN: z.string().min(20, "BOT_TOKEN missing — get one from @BotFather"),
  WEB_APP_URL: z.string().url(),
  // Required so the bot can persist deep-link payloads (referrals, profile
  // views) directly to the same Postgres the API uses. Bot writes to a
  // small whitelist of User columns; auth.service consumes them on login.
  DATABASE_URL: z.string().min(1),
});

export const env = (() => {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    console.error("[bot] invalid env:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
})();

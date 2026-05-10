import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  WEB_ORIGIN: z
    .union([z.literal("*"), z.string().url()])
    .default("http://localhost:5173"),
  BOT_TOKEN: z.string().min(1),
  WEB_APP_URL: z.string().url(),
  // Long random string (e.g. `openssl rand -hex 32`). Required to access
  // /admin/* endpoints and the /admin?token=... screen. Never share.
  ADMIN_TOKEN: z.string().min(16),
  // CSV of Telegram IDs (e.g. "731907172,481638710"). Used by the API
  // to DM admins when a fresh profile lands in the moderation queue,
  // so they don't have to manually poll the queue. Same env var is
  // read by the bot for /admin command whitelisting — keep them in
  // sync. Empty / missing = no admin DMs (acceptable in dev).
  ADMIN_TELEGRAM_IDS: z
    .string()
    .optional()
    .transform((raw) =>
      raw
        ? raw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => /^\d+$/.test(s))
            .map((s) => Number(s))
        : [],
    ),
});

export const env = (() => {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
})();

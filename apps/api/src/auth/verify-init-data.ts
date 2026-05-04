import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramInitUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

export class InitDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InitDataError";
  }
}

const MAX_AGE_SECONDS = 24 * 60 * 60;

export function verifyInitData(initData: string, botToken: string): TelegramInitUser {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new InitDataError("hash missing");
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const gotBuf = Buffer.from(hash, "hex");
  if (expectedBuf.length !== gotBuf.length || !timingSafeEqual(expectedBuf, gotBuf)) {
    throw new InitDataError("signature mismatch");
  }

  const authDateRaw = params.get("auth_date");
  if (!authDateRaw) throw new InitDataError("auth_date missing");
  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate)) throw new InitDataError("auth_date invalid");
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > MAX_AGE_SECONDS) throw new InitDataError("initData expired");
  if (ageSec < -60) throw new InitDataError("auth_date in the future");

  const userRaw = params.get("user");
  if (!userRaw) throw new InitDataError("user missing");
  let user: TelegramInitUser;
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw new InitDataError("user payload not JSON");
  }
  if (typeof user?.id !== "number") throw new InitDataError("user.id missing");

  return user;
}

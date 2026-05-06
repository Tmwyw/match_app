import { prisma } from "./prisma.js";

/**
 * Telegram /start arrives as `/start <payload>` (the part after the bot
 * username in `t.me/<bot>?start=<payload>`). Two payloads we recognise:
 *
 *   p_<userId>   — open this user's card next time the Mini App launches
 *   ref_<userId> — set me as referredBy <userId> on FIRST auth only
 *
 * We persist by either updating the existing User row (matched by
 * telegramId) or creating a stub so the data survives until the user
 * actually opens the Mini App and goes through /auth/telegram. The
 * stub has no role/anonId yet — onboarding fills those in.
 */
export async function handleStartPayload(
  telegramId: number,
  username: string | null,
  payload: string | undefined,
): Promise<void> {
  if (!payload) return;
  const tgId = BigInt(telegramId);

  if (payload.startsWith("p_")) {
    const targetId = payload.slice(2);
    if (!targetId) return;
    // Verify the target exists & isn't deleted/banned — otherwise we'd save
    // a payload that the frontend would 404 on.
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, deletedAt: true, bannedAt: true },
    });
    if (!target || target.deletedAt || target.bannedAt) return;

    await prisma.user.upsert({
      where: { telegramId: tgId },
      create: {
        telegramId: tgId,
        username,
        pendingViewProfile: targetId,
      },
      update: { pendingViewProfile: targetId },
    });
    return;
  }

  if (payload.startsWith("ref_")) {
    const referrerId = payload.slice(4);
    if (!referrerId) return;
    const referrer = await prisma.user.findUnique({
      where: { id: referrerId },
      select: { id: true, deletedAt: true, bannedAt: true },
    });
    if (!referrer || referrer.deletedAt || referrer.bannedAt) return;

    const existing = await prisma.user.findUnique({
      where: { telegramId: tgId },
      select: { id: true, referredById: true },
    });
    if (!existing) {
      // Brand-new user — stub them with the referral attribution baked in.
      // referredById on a fresh row is the only safe place to write it;
      // back-dating an established account would let people farm referrals.
      if (referrerId === undefined) return;
      await prisma.user.create({
        data: {
          telegramId: tgId,
          username,
          referredById: referrerId,
        },
      });
      return;
    }
    // Existing user with no referrer yet — also fine to attribute, since
    // they haven't been counted toward anyone's invite stats.
    if (!existing.referredById && existing.id !== referrerId) {
      await prisma.user.update({
        where: { telegramId: tgId },
        data: { referredById: referrerId },
      });
    }
  }
}

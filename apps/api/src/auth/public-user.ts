import type { User } from "@prisma/client";
import type { MeResponse, PublicUser } from "@tg-app-meet/shared";

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    telegramId: Number(user.telegramId),
    username: user.username,
    role: user.role,
    anonId: user.anonId,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Adds the /me-only side-channel fields. Never expose these to other users. */
export function toMeResponse(
  user: User,
  extras: { referralCount: number },
): MeResponse {
  return {
    ...toPublicUser(user),
    referralCount: extras.referralCount,
    pendingViewProfile: user.pendingViewProfile,
  };
}

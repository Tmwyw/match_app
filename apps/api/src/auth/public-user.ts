import type { User } from "@prisma/client";
import type { PublicUser } from "@tg-app-meet/shared";

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

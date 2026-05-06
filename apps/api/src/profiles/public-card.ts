import type { BuyerProfile, OwnerProfile, Role, User } from "@prisma/client";
import { type PublicCard, PublicBuyerCard, PublicOwnerCard } from "@tg-app-meet/shared";

export type UserWithProfiles = User & {
  buyerProfile: BuyerProfile | null;
  ownerProfile: OwnerProfile | null;
};

const PLUG_ANON = "Аккаунт удалён";

export function toPublicCard(user: UserWithProfiles): PublicCard {
  if (!user.role || !user.anonId) {
    throw new Error(`user ${user.id} has no role/anonId`);
  }
  if (user.role === "BUYER") {
    if (!user.buyerProfile) throw new Error(`buyer ${user.id} missing profile`);
    return PublicBuyerCard.parse({
      userId: user.id,
      anonId: user.anonId,
      displayName: user.displayName,
      role: "BUYER",
      verticals: user.buyerProfile.verticals,
      geos: user.buyerProfile.geos,
      budgetMin: user.buyerProfile.budgetMin,
      budgetMax: user.buyerProfile.budgetMax,
      experience: user.buyerProfile.experience,
      bio: user.buyerProfile.bio,
    });
  }
  if (!user.ownerProfile) throw new Error(`owner ${user.id} missing profile`);
  return PublicOwnerCard.parse({
    userId: user.id,
    anonId: user.anonId,
    displayName: user.displayName,
    role: "OWNER",
    offerName: user.ownerProfile.offerName,
    vertical: user.ownerProfile.vertical,
    geos: user.ownerProfile.geos,
    payoutTypes: user.ownerProfile.payoutTypes,
    payoutAmount: user.ownerProfile.payoutAmount,
    requirements: user.ownerProfile.requirements,
    bio: user.ownerProfile.bio,
  });
}

/**
 * Synthetic card for a soft-deleted user. Real role is preserved (we still
 * know it from the User row), every other field is a placeholder so the
 * partner's UI doesn't crash on missing profile data.
 */
export function deletedPlugCard(
  userId: string,
  role: Role | null,
): PublicCard {
  const effectiveRole: Role = role ?? "BUYER";
  if (effectiveRole === "BUYER") {
    return PublicBuyerCard.parse({
      userId,
      anonId: PLUG_ANON,
      displayName: null,
      role: "BUYER",
      verticals: [],
      geos: [],
      budgetMin: 0,
      budgetMax: 0,
      experience: 0,
      bio: null,
    });
  }
  return PublicOwnerCard.parse({
    userId,
    anonId: PLUG_ANON,
    displayName: null,
    role: "OWNER",
    offerName: "—",
    vertical: "—",
    geos: [],
    payoutTypes: [],
    payoutAmount: 0,
    requirements: null,
    bio: null,
  });
}

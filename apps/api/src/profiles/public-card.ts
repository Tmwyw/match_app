import type { BuyerProfile, OwnerProfile, User } from "@prisma/client";
import { type PublicCard, PublicBuyerCard, PublicOwnerCard } from "@tg-app-meet/shared";

export type UserWithProfiles = User & {
  buyerProfile: BuyerProfile | null;
  ownerProfile: OwnerProfile | null;
};

export function toPublicCard(user: UserWithProfiles): PublicCard {
  if (!user.role || !user.anonId) {
    throw new Error(`user ${user.id} has no role/anonId`);
  }
  if (user.role === "BUYER") {
    if (!user.buyerProfile) throw new Error(`buyer ${user.id} missing profile`);
    return PublicBuyerCard.parse({
      userId: user.id,
      anonId: user.anonId,
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
    role: "OWNER",
    offerName: user.ownerProfile.offerName,
    vertical: user.ownerProfile.vertical,
    geos: user.ownerProfile.geos,
    payoutType: user.ownerProfile.payoutType,
    payoutAmount: user.ownerProfile.payoutAmount,
    requirements: user.ownerProfile.requirements,
    bio: user.ownerProfile.bio,
  });
}

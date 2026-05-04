import { z } from "zod";
import { Geo, PayoutType, Vertical } from "./roles";

export const BuyerProfileInput = z.object({
  verticals: z.array(Vertical).min(1).max(9),
  geos: z.array(Geo).min(1).max(10),
  budgetMin: z.number().int().nonnegative(),
  budgetMax: z.number().int().positive(),
  experience: z.number().int().min(0).max(50),
  bio: z.string().max(500).optional(),
}).refine((v) => v.budgetMax >= v.budgetMin, {
  message: "budgetMax must be >= budgetMin",
  path: ["budgetMax"],
});
export type BuyerProfileInput = z.infer<typeof BuyerProfileInput>;

export const OwnerProfileInput = z.object({
  offerName: z.string().min(1).max(80),
  vertical: Vertical,
  geos: z.array(Geo).min(1).max(10),
  payoutType: PayoutType,
  payoutAmount: z.number().int().positive(),
  requirements: z.string().max(500).optional(),
  bio: z.string().max(500).optional(),
});
export type OwnerProfileInput = z.infer<typeof OwnerProfileInput>;

export const PublicBuyerCard = z.object({
  userId: z.string(),
  anonId: z.string(),
  role: z.literal("BUYER"),
  verticals: z.array(Vertical),
  geos: z.array(Geo),
  budgetMin: z.number().int(),
  budgetMax: z.number().int(),
  experience: z.number().int(),
  bio: z.string().nullable(),
});
export type PublicBuyerCard = z.infer<typeof PublicBuyerCard>;

export const PublicOwnerCard = z.object({
  userId: z.string(),
  anonId: z.string(),
  role: z.literal("OWNER"),
  offerName: z.string(),
  vertical: Vertical,
  geos: z.array(Geo),
  payoutType: PayoutType,
  payoutAmount: z.number().int(),
  requirements: z.string().nullable(),
  bio: z.string().nullable(),
});
export type PublicOwnerCard = z.infer<typeof PublicOwnerCard>;

export const PublicCard = z.discriminatedUnion("role", [
  PublicBuyerCard,
  PublicOwnerCard,
]);
export type PublicCard = z.infer<typeof PublicCard>;

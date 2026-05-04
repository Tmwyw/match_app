import { z } from "zod";
import { Geo, PayoutType, Vertical } from "./roles";

const BuyerShape = z.object({
  verticals: z.array(Vertical).min(1).max(5),
  geos: z.array(Geo).min(1).max(10),
  budgetMin: z.number().int().positive(),
  budgetMax: z.number().int().positive(),
  experience: z.number().int().min(0).max(50),
  bio: z.string().max(500).nullish(),
});

export const BuyerProfileInput = BuyerShape.refine(
  (v) => v.budgetMax >= v.budgetMin,
  { message: "budgetMax must be >= budgetMin", path: ["budgetMax"] },
);
export type BuyerProfileInput = z.infer<typeof BuyerProfileInput>;

export const BuyerProfilePatch = BuyerShape.partial();
export type BuyerProfilePatch = z.infer<typeof BuyerProfilePatch>;

const OwnerShape = z.object({
  offerName: z.string().min(2).max(100),
  vertical: Vertical,
  geos: z.array(Geo).min(1).max(10),
  payoutType: PayoutType,
  payoutAmount: z.number().int().positive(),
  requirements: z.string().max(500).nullish(),
  bio: z.string().max(500).nullish(),
});

export const OwnerProfileInput = OwnerShape;
export type OwnerProfileInput = z.infer<typeof OwnerProfileInput>;

export const OwnerProfilePatch = OwnerShape.partial();
export type OwnerProfilePatch = z.infer<typeof OwnerProfilePatch>;

export const MyBuyerProfile = z.object({
  role: z.literal("BUYER"),
  verticals: z.array(Vertical),
  geos: z.array(Geo),
  budgetMin: z.number().int(),
  budgetMax: z.number().int(),
  experience: z.number().int(),
  bio: z.string().nullable(),
});
export type MyBuyerProfile = z.infer<typeof MyBuyerProfile>;

export const MyOwnerProfile = z.object({
  role: z.literal("OWNER"),
  offerName: z.string(),
  vertical: Vertical,
  geos: z.array(Geo),
  payoutType: PayoutType,
  payoutAmount: z.number().int(),
  requirements: z.string().nullable(),
  bio: z.string().nullable(),
});
export type MyOwnerProfile = z.infer<typeof MyOwnerProfile>;

export const MyProfileResponse = z.discriminatedUnion("role", [
  MyBuyerProfile,
  MyOwnerProfile,
]);
export type MyProfileResponse = z.infer<typeof MyProfileResponse>;

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

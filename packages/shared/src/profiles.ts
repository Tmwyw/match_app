import { z } from "zod";
import { Geo, PayoutType, Vertical } from "./roles";
// PayoutType is re-exported from ./roles via index.ts; we still reference
// the enum here only to source the chip presets for the FE TagInput.

// `Vertical` and `Geo` enums (in roles.ts) are kept as **suggestions** for
// the UI — but storage / input now accepts any short tag so users can write
// niches that we haven't pre-baked (e.g. "TG_ADS", "BANGLA", their own
// gambling vertical name, etc.). Tag = trimmed, 1-40 chars, no newlines.
const Tag = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[^\n\r]+$/u, "no line breaks");

const TagList = (max: number) => z.array(Tag).min(1).max(max);

/** Optional user-chosen display name. Empty string / null falls back to the
 *  auto-assigned anonId. Anti-deanon scrub runs server-side regardless. */
const DisplayName = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[^\n\r]+$/u, "no line breaks");

const BuyerShape = z.object({
  displayName: DisplayName.nullish(),
  // "Интересующая вакансия" — what role they're applying for. Optional
  // (legacy rows have ''), but new submissions will typically fill it.
  desiredPosition: z.string().max(100).default(""),
  trafficSources: TagList(8),
  verticals: TagList(8),
  geos: TagList(15),
  budgetMin: z.number().int().positive(),
  budgetMax: z.number().int().positive(),
  experience: z.number().int().min(0).max(50),
  // "Дополнительно" — короткая заметка, ≤100 chars (matches OwnerShape).
  notes: z.string().max(100).nullish(),
});

export const BuyerProfileInput = BuyerShape.refine(
  (v) => v.budgetMax >= v.budgetMin,
  { message: "budgetMax must be >= budgetMin", path: ["budgetMax"] },
);
export type BuyerProfileInput = z.infer<typeof BuyerProfileInput>;

export const BuyerProfilePatch = BuyerShape.partial();
export type BuyerProfilePatch = z.infer<typeof BuyerProfilePatch>;

const OwnerShape = z.object({
  displayName: DisplayName.nullish(),
  // "Кто нужен в команду?" — short label for the role they're hiring.
  offerName: z.string().min(2).max(100),
  // "Источник трафика" — multi-select traffic sources (FB, GOOGLE, …).
  trafficSources: TagList(8),
  // "Вертикаль" — multi-select industry niches (Gambling, Crypto, …).
  verticals: TagList(8),
  geos: TagList(15),
  // "Оплата" — salary/payment range. Same pattern as buyer's budget.
  payoutMin: z.number().int().positive(),
  payoutMax: z.number().int().positive(),
  // "Дополнительно" — short note, ≤100 chars.
  requirements: z.string().max(100).nullish(),
  // Short team description ≤100 chars.
  bio: z.string().max(100).nullish(),
});

export const OwnerProfileInput = OwnerShape.refine(
  (v) => v.payoutMax >= v.payoutMin,
  { message: "payoutMax must be >= payoutMin", path: ["payoutMax"] },
);
export type OwnerProfileInput = z.infer<typeof OwnerProfileInput>;

export const OwnerProfilePatch = OwnerShape.partial();
export type OwnerProfilePatch = z.infer<typeof OwnerProfilePatch>;

export const MyBuyerProfile = z.object({
  role: z.literal("BUYER"),
  displayName: z.string().nullable(),
  desiredPosition: z.string(),
  trafficSources: z.array(z.string()),
  verticals: z.array(z.string()),
  geos: z.array(z.string()),
  budgetMin: z.number().int(),
  budgetMax: z.number().int(),
  experience: z.number().int(),
  notes: z.string().nullable(),
});
export type MyBuyerProfile = z.infer<typeof MyBuyerProfile>;

export const MyOwnerProfile = z.object({
  role: z.literal("OWNER"),
  displayName: z.string().nullable(),
  offerName: z.string(),
  trafficSources: z.array(z.string()),
  verticals: z.array(z.string()),
  geos: z.array(z.string()),
  payoutMin: z.number().int(),
  payoutMax: z.number().int(),
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
  // Optional user-chosen nickname; if present, UIs prefer this over anonId.
  displayName: z.string().nullable(),
  role: z.literal("BUYER"),
  desiredPosition: z.string(),
  trafficSources: z.array(z.string()),
  verticals: z.array(z.string()),
  geos: z.array(z.string()),
  budgetMin: z.number().int(),
  budgetMax: z.number().int(),
  experience: z.number().int(),
  notes: z.string().nullable(),
});
export type PublicBuyerCard = z.infer<typeof PublicBuyerCard>;

export const PublicOwnerCard = z.object({
  userId: z.string(),
  anonId: z.string(),
  displayName: z.string().nullable(),
  role: z.literal("OWNER"),
  offerName: z.string(),
  trafficSources: z.array(z.string()),
  verticals: z.array(z.string()),
  geos: z.array(z.string()),
  payoutMin: z.number().int(),
  payoutMax: z.number().int(),
  requirements: z.string().nullable(),
  bio: z.string().nullable(),
});
export type PublicOwnerCard = z.infer<typeof PublicOwnerCard>;

export const PublicCard = z.discriminatedUnion("role", [
  PublicBuyerCard,
  PublicOwnerCard,
]);
export type PublicCard = z.infer<typeof PublicCard>;

export const DiscoverResponse = z.object({
  card: PublicCard.nullable(),
  remaining: z.number().int().nonnegative(),
});
export type DiscoverResponse = z.infer<typeof DiscoverResponse>;

// Re-export presets so the UI can suggest them as quick-pick chips.
// Buyer-side presets stay broad (covers historical data).
export const VerticalPresets = Vertical.options;
export const GeoPresets = Geo.options;
export const PayoutTypePresets = PayoutType.options;

// Owner-form presets are intentionally tighter — owners pick the role
// they're hiring, not the broader landscape, so we curate.
export const OwnerTrafficSourcePresets = [
  "FB",
  "GOOGLE",
  "TIKTOK",
  "SEO",
  "OTHER",
] as const;
export const OwnerIndustryVerticalPresets = [
  "Gambling",
  "Crypto",
  "Dating",
  "Nutra",
  "Finance",
  "Forex",
  "Adult",
  "Sweepstakes",
  "eCommerce",
] as const;
export const OwnerGeoPresets = [
  "LATAM",
  "СНГ",
  "AFRICA",
  "EU",
  "OTHER",
] as const;

// Buyer-form presets mirror Owner so both sides see consistent chips.
export const BuyerTrafficSourcePresets = OwnerTrafficSourcePresets;
export const BuyerIndustryVerticalPresets = OwnerIndustryVerticalPresets;
export const BuyerGeoPresets = OwnerGeoPresets;

/** Common arbitrage-team positions. Used for both:
 *  — Buyer profile's "интересующая вакансия" (the role they're applying for)
 *  — Owner profile's "Кто нужен в команду?" (the role they're hiring)
 *
 *  Free-text was replaced with this curated list to discourage bypass
 *  (`@username` typed in there). The "Other" escape hatch keeps the door
 *  open for niche roles. */
export const PositionPresets = [
  "CEO",
  "Buyer / Медиабайер",
  "Team Lead",
  "Affiliate Manager",
  "Sales / Продажник",
  "Account Manager",
  "Content Manager",
  "Обработчик",
  "Tech / Антифрод",
  "Other",
] as const;

/** Buyer-side alias kept for back-compat — frontend imports work either way. */
export const BuyerPositionPresets = PositionPresets;

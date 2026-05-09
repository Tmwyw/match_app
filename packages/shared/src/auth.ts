import { z } from "zod";
import { Role } from "./roles";

export const AuthRequest = z.object({
  initData: z.string().min(1),
});
export type AuthRequest = z.infer<typeof AuthRequest>;

export const PublicUser = z.object({
  id: z.string(),
  telegramId: z.number(),
  username: z.string().nullable(),
  role: Role.nullable(),
  anonId: z.string().nullable(),
  // User-chosen nickname; if set, replaces anonId in user-facing displays
  // (cards, chat headers, messages). anonId stays in DB for forensics.
  displayName: z.string().nullable(),
  createdAt: z.string(),
});
export type PublicUser = z.infer<typeof PublicUser>;

/** Auth response also delivers an initial deep-link payload (consumed once
 *  on first /me call) — `pendingViewProfile` from the bot /start handler.
 *  Frontend reads it, opens the user card, then clears via /me/pending-view. */
export const AuthResponse = z.object({
  token: z.string(),
  user: PublicUser,
});
export type AuthResponse = z.infer<typeof AuthResponse>;

/** /me extends PublicUser with side-channel counters that the profile UI
 *  needs (referrals, pending deep-link). Keeping them out of PublicUser
 *  means we never accidentally leak them via PublicCard. */
export const MeResponse = PublicUser.extend({
  referralCount: z.number().int().nonnegative(),
  pendingViewProfile: z.string().nullable(),
  // Profile moderation gate. Frontend uses this to decide whether to
  // route the user into the deck (approved) or into the "submitted for
  // review" holding screen (null). True when the User row has a non-null
  // profileApprovedAt timestamp.
  profileApproved: z.boolean(),
});
export type MeResponse = z.infer<typeof MeResponse>;

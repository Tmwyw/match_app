import { z } from "zod";

export const NotificationPrefsResponse = z.object({
  matches: z.boolean(),
  messages: z.boolean(),
  digestMode: z.boolean(),
  /** ISO timestamp; null means not muted. */
  mutedUntil: z.string().nullable(),
});
export type NotificationPrefsResponse = z.infer<typeof NotificationPrefsResponse>;

export const NotificationPrefsPatch = z
  .object({
    matches: z.boolean(),
    messages: z.boolean(),
    digestMode: z.boolean(),
    mutedUntil: z.string().datetime().nullable(),
  })
  .partial();
export type NotificationPrefsPatch = z.infer<typeof NotificationPrefsPatch>;

export const ReferralLinkResponse = z.object({
  link: z.string().url(),
});
export type ReferralLinkResponse = z.infer<typeof ReferralLinkResponse>;

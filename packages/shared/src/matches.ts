import { z } from "zod";
import { PublicCard } from "./profiles";

export const MatchSummary = z.object({
  matchId: z.string(),
  chatId: z.string(),
  createdAt: z.string(),
  // Last-message metadata for Telegram-style chat-list rendering.
  // All three are null when the chat has no messages yet (matched but
  // nobody has written) — UI then falls back to the profile summary.
  lastMessageAt: z.string().nullable(),
  lastMessagePreview: z.string().nullable(),
  lastMessageFromMe: z.boolean(),
  // Incoming messages that haven't been marked readAt yet by me.
  // Used for the "N непрочитанных" badge on the right of each row.
  unreadCount: z.number().int().nonnegative(),
  other: PublicCard,
});
export type MatchSummary = z.infer<typeof MatchSummary>;

export const MatchesListResponse = z.array(MatchSummary);
export type MatchesListResponse = z.infer<typeof MatchesListResponse>;

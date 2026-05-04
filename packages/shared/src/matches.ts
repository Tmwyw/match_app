import { z } from "zod";
import { PublicCard } from "./profiles";

export const MatchSummary = z.object({
  matchId: z.string(),
  chatId: z.string(),
  createdAt: z.string(),
  other: PublicCard,
});
export type MatchSummary = z.infer<typeof MatchSummary>;

export const MatchesListResponse = z.array(MatchSummary);
export type MatchesListResponse = z.infer<typeof MatchesListResponse>;

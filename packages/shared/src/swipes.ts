import { z } from "zod";

export const SwipeAction = z.enum(["LIKE", "SKIP"]);
export type SwipeAction = z.infer<typeof SwipeAction>;

export const SwipeRequest = z.object({
  toUserId: z.string().min(1),
  action: SwipeAction,
});
export type SwipeRequest = z.infer<typeof SwipeRequest>;

export const SwipeResponse = z.object({
  matched: z.boolean(),
  matchId: z.string().nullable(),
  chatId: z.string().nullable(),
});
export type SwipeResponse = z.infer<typeof SwipeResponse>;

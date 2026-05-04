import { z } from "zod";

export const SwipeAction = z.enum(["LIKE", "SKIP"]);
export type SwipeAction = z.infer<typeof SwipeAction>;

export const SwipeInput = z.object({
  toId: z.string().min(1),
  action: SwipeAction,
});
export type SwipeInput = z.infer<typeof SwipeInput>;

export const SwipeResult = z.object({
  matched: z.boolean(),
  matchId: z.string().nullable(),
  chatId: z.string().nullable(),
});
export type SwipeResult = z.infer<typeof SwipeResult>;

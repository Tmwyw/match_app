import { z } from "zod";

export const RevealStatus = z.object({
  /** Я (текущий юзер) согласился. */
  meAccepted: z.boolean(),
  /** Собеседник согласился. */
  otherAccepted: z.boolean(),
  /** Если оба → настоящий @username собеседника, иначе null. */
  otherUsername: z.string().nullable(),
});
export type RevealStatus = z.infer<typeof RevealStatus>;

export const RevealResponse = RevealStatus;
export type RevealResponse = z.infer<typeof RevealResponse>;

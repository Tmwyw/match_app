import { z } from "zod";

const Tag = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[^\n\r,]+$/u, "no commas or newlines");

export const DiscoverFilters = z.object({
  /** Empty array = no filter on this dimension (server intersects only when present). */
  verticals: z.array(Tag).max(8).default([]),
  geos: z.array(Tag).max(15).default([]),
});
export type DiscoverFilters = z.infer<typeof DiscoverFilters>;

export const LikesCountResponse = z.object({
  count: z.number().int().nonnegative(),
});
export type LikesCountResponse = z.infer<typeof LikesCountResponse>;

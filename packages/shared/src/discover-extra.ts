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
  /** Minimum years of experience the buyer should have. Owners use it
   *  to filter the deck to candidates with ≥N years. Buyers ignore it
   *  (owners don't have an "experience" field). 0 / undefined = no filter. */
  experienceMin: z.number().int().min(0).max(50).optional(),
});
export type DiscoverFilters = z.infer<typeof DiscoverFilters>;

export const LikesCountResponse = z.object({
  count: z.number().int().nonnegative(),
});
export type LikesCountResponse = z.infer<typeof LikesCountResponse>;

import { z } from "zod";
import { Role } from "./roles";

export const BlockedUser = z.object({
  userId: z.string(),
  anonId: z.string().nullable(),
  displayName: z.string().nullable(),
  role: Role.nullable(),
  blockedAt: z.string(),
});
export type BlockedUser = z.infer<typeof BlockedUser>;

export const BlocksResponse = z.array(BlockedUser);
export type BlocksResponse = z.infer<typeof BlocksResponse>;

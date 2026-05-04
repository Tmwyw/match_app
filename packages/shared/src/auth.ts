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
  createdAt: z.string(),
});
export type PublicUser = z.infer<typeof PublicUser>;

export const AuthResponse = z.object({
  token: z.string(),
  user: PublicUser,
});
export type AuthResponse = z.infer<typeof AuthResponse>;

export const MeResponse = PublicUser;
export type MeResponse = z.infer<typeof MeResponse>;

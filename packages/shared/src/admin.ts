import { z } from "zod";
import { Role } from "./roles";

// ─── Stats ──────────────────────────────────────────────────────────────────

export const AdminStats = z.object({
  users: z.object({
    total: z.number().int(),
    withRole: z.number().int(),
    buyers: z.number().int(),
    owners: z.number().int(),
    banned: z.number().int(),
    deleted: z.number().int(),
    onlineNow: z.number().int(),
    new24h: z.number().int(),
    new7d: z.number().int(),
  }),
  matches: z.object({
    total: z.number().int(),
    last24h: z.number().int(),
    last7d: z.number().int(),
  }),
  messages: z.object({
    total: z.number().int(),
    last24h: z.number().int(),
  }),
  reports: z.object({
    open: z.number().int(),
    resolved: z.number().int(),
    last7d: z.number().int(),
  }),
});
export type AdminStats = z.infer<typeof AdminStats>;

// ─── Users ──────────────────────────────────────────────────────────────────

export const AdminUserStatus = z.enum(["any", "active", "banned", "deleted"]);
export type AdminUserStatus = z.infer<typeof AdminUserStatus>;

export const AdminUserSummary = z.object({
  id: z.string(),
  telegramId: z.string(), // BigInt → string for JSON safety
  username: z.string().nullable(),
  role: Role.nullable(),
  anonId: z.string().nullable(),
  createdAt: z.string(),
  lastSeenAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  bannedAt: z.string().nullable(),
  banReason: z.string().nullable(),
  isOnline: z.boolean(),
  counts: z.object({
    matches: z.number().int(),
    messages: z.number().int(),
    reportsAgainst: z.number().int(),
    blocksAgainst: z.number().int(),
  }),
});
export type AdminUserSummary = z.infer<typeof AdminUserSummary>;

export const AdminUsersResponse = z.object({
  rows: z.array(AdminUserSummary),
  total: z.number().int(),
});
export type AdminUsersResponse = z.infer<typeof AdminUsersResponse>;

export const AdminUserDetail = AdminUserSummary.extend({
  buyerProfile: z
    .object({
      verticals: z.array(z.string()),
      geos: z.array(z.string()),
      budgetMin: z.number().int(),
      budgetMax: z.number().int(),
      experience: z.number().int(),
      bio: z.string().nullable(),
      isActive: z.boolean(),
    })
    .nullable(),
  ownerProfile: z
    .object({
      offerName: z.string(),
      vertical: z.string(),
      geos: z.array(z.string()),
      payoutType: z.string(),
      payoutAmount: z.number().int(),
      requirements: z.string().nullable(),
      bio: z.string().nullable(),
      isActive: z.boolean(),
    })
    .nullable(),
  recentReportsAgainst: z.array(
    z.object({
      id: z.string(),
      reason: z.string(),
      details: z.string().nullable(),
      reporterAnonId: z.string().nullable(),
      createdAt: z.string(),
      resolvedAt: z.string().nullable(),
      resolution: z.string().nullable(),
    }),
  ),
  recentChats: z.array(
    z.object({
      chatId: z.string(),
      matchId: z.string(),
      otherUserId: z.string(),
      otherAnonId: z.string().nullable(),
      messagesCount: z.number().int(),
      lastMessageAt: z.string().nullable(),
    }),
  ),
});
export type AdminUserDetail = z.infer<typeof AdminUserDetail>;

export const AdminBanInput = z.object({
  reason: z.string().min(1).max(500),
});
export type AdminBanInput = z.infer<typeof AdminBanInput>;

// ─── Chat forensics ─────────────────────────────────────────────────────────

export const AdminChatMessage = z.object({
  id: z.string(),
  chatId: z.string(),
  senderId: z.string(),
  senderAnonId: z.string().nullable(),
  content: z.string(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  readAt: z.string().nullable(),
});
export type AdminChatMessage = z.infer<typeof AdminChatMessage>;

export const AdminChatTranscript = z.object({
  chatId: z.string(),
  matchId: z.string(),
  participants: z.array(
    z.object({
      id: z.string(),
      anonId: z.string().nullable(),
      role: Role.nullable(),
      username: z.string().nullable(),
      bannedAt: z.string().nullable(),
      deletedAt: z.string().nullable(),
    }),
  ),
  messages: z.array(AdminChatMessage),
});
export type AdminChatTranscript = z.infer<typeof AdminChatTranscript>;

import { z } from "zod";

export const ReportReason = z.enum([
  "spam",
  "scam",
  "deanon",
  "abuse",
  "other",
]);
export type ReportReason = z.infer<typeof ReportReason>;

export const ReportResolution = z.enum(["no_action", "warned", "banned"]);
export type ReportResolution = z.infer<typeof ReportResolution>;

export const CreateReportInput = z.object({
  targetUserId: z.string().min(1),
  chatId: z.string().min(1).nullish(),
  reason: ReportReason,
  details: z.string().max(2000).nullish(),
});
export type CreateReportInput = z.infer<typeof CreateReportInput>;

export const ReportResponse = z.object({
  id: z.string(),
  createdAt: z.string(),
});
export type ReportResponse = z.infer<typeof ReportResponse>;

// Admin-side payloads (consumed by the /admin React screen).
export const AdminReport = z.object({
  id: z.string(),
  reporterId: z.string(),
  reporterAnonId: z.string().nullable(),
  targetUserId: z.string(),
  targetAnonId: z.string().nullable(),
  targetUsername: z.string().nullable(),
  targetBannedAt: z.string().nullable(),
  chatId: z.string().nullable(),
  reason: ReportReason,
  details: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  resolution: ReportResolution.nullable(),
});
export type AdminReport = z.infer<typeof AdminReport>;

export const AdminReportsResponse = z.array(AdminReport);
export type AdminReportsResponse = z.infer<typeof AdminReportsResponse>;

export const ResolveReportInput = z.object({
  resolution: ReportResolution,
  banReason: z.string().max(500).nullish(),
});
export type ResolveReportInput = z.infer<typeof ResolveReportInput>;

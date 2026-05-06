import type {
  AdminBanInput,
  AdminChatTranscript,
  AdminReport,
  AdminReportsResponse,
  AdminStats,
  AdminUserDetail,
  AdminUsersResponse,
  ResolveReportInput,
} from "@tg-app-meet/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

class AdminApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "AdminApiError";
  }
}

async function adminFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && body && "message" in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${res.status}`;
    throw new AdminApiError(res.status, msg);
  }
  return body as T;
}

export const adminApi = {
  stats: (token: string) => adminFetch<AdminStats>(token, "/admin/stats"),

  listUsers: (
    token: string,
    params: {
      q?: string;
      status?: string;
      role?: string;
      take?: number;
      skip?: number;
    },
  ) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.status) qs.set("status", params.status);
    if (params.role) qs.set("role", params.role);
    if (params.take != null) qs.set("take", String(params.take));
    if (params.skip != null) qs.set("skip", String(params.skip));
    const tail = qs.toString();
    return adminFetch<AdminUsersResponse>(
      token,
      `/admin/users${tail ? `?${tail}` : ""}`,
    );
  },

  userDetail: (token: string, id: string) =>
    adminFetch<AdminUserDetail>(token, `/admin/users/${id}`),

  banUser: (token: string, id: string, body: AdminBanInput) =>
    adminFetch<AdminUserDetail>(token, `/admin/users/${id}/ban`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  unbanUser: (token: string, id: string) =>
    adminFetch<AdminUserDetail>(token, `/admin/users/${id}/unban`, {
      method: "POST",
    }),

  resetUserRole: (token: string, id: string) =>
    adminFetch<AdminUserDetail>(token, `/admin/users/${id}/reset-role`, {
      method: "POST",
    }),

  chatTranscript: (token: string, id: string) =>
    adminFetch<AdminChatTranscript>(token, `/admin/chats/${id}/messages`),

  reports: (token: string, includeResolved: boolean) =>
    adminFetch<AdminReportsResponse>(
      token,
      `/admin/reports?resolved=${includeResolved ? "true" : "false"}`,
    ),

  resolveReport: (token: string, id: string, body: ResolveReportInput) =>
    adminFetch<AdminReport>(token, `/admin/reports/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export { AdminApiError };

const API_URL = import.meta.env.VITE_API_URL ?? "/api";
const TOKEN_KEY = "tgmeet_token";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Convenience: extract a structured `code` field from the error body
   *  (we use this for "BANNED" / "ACCOUNT_DELETED" forbidden responses). */
  get code(): string | null {
    if (this.body && typeof this.body === "object" && "code" in this.body) {
      const c = (this.body as { code: unknown }).code;
      return typeof c === "string" ? c : null;
    }
    return null;
  }
}

/**
 * Token storage with in-memory primary + localStorage best-effort backup.
 *
 * Why in-memory primary:
 *   Telegram mobile webviews (especially iOS) sometimes silently no-op
 *   localStorage writes — getItem after setItem returns null. The auth
 *   flow then "succeeds" (UI advances past auth) but every subsequent
 *   request goes out without the Authorization header → "missing bearer
 *   token". Holding the token in a module-level variable is reliable
 *   for the lifetime of the page; localStorage is a bonus that lets us
 *   skip re-auth on the next page open.
 */
let memoryToken: string | null = null;

function safeLocalGet(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function safeLocalSet(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // restricted webview / private mode — memoryToken still works.
  }
}

function safeLocalRemove(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* no-op */
  }
}

export function getToken(): string | null {
  if (memoryToken) return memoryToken;
  const persisted = safeLocalGet();
  if (persisted) memoryToken = persisted;
  return memoryToken;
}

export function setToken(token: string): void {
  memoryToken = token;
  safeLocalSet(token);
}

export function clearToken(): void {
  memoryToken = null;
  safeLocalRemove();
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  const token = getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (res.status === 401) {
    clearToken();
  }

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, body);
  }

  return body as T;
}

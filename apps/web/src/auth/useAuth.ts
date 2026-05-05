import { useCallback, useEffect, useState } from "react";
import type { AuthResponse, MeResponse, PublicUser } from "@tg-app-meet/shared";
import { api, ApiError, clearToken, getToken, setToken } from "../api";
import { getTelegramWebApp } from "../telegram";

type State =
  | { status: "loading"; user: null; error: null }
  | { status: "authed"; user: PublicUser; error: null }
  | { status: "needs-telegram"; user: null; error: null }
  | { status: "banned"; user: null; error: string | null }
  | { status: "deleted"; user: null; error: null }
  | { status: "error"; user: null; error: string };

export function useAuth() {
  const [state, setState] = useState<State>({
    status: "loading",
    user: null,
    error: null,
  });

  const run = useCallback(async () => {
    setState({ status: "loading", user: null, error: null });
    try {
      if (getToken()) {
        try {
          const me = await api<MeResponse>("/me");
          setState({ status: "authed", user: me, error: null });
          return;
        } catch (e) {
          if (e instanceof ApiError && e.status === 403 && e.code === "BANNED") {
            const reason = readReason(e.body);
            setState({ status: "banned", user: null, error: reason });
            return;
          }
          if (
            e instanceof ApiError &&
            e.status === 403 &&
            e.code === "ACCOUNT_DELETED"
          ) {
            clearToken();
            setState({ status: "deleted", user: null, error: null });
            return;
          }
          if (!(e instanceof ApiError && e.status === 401)) throw e;
          // 401 → token already cleared by api(); fall through to initData flow
        }
      }

      const initData = getTelegramWebApp()?.initData;
      if (!initData) {
        setState({ status: "needs-telegram", user: null, error: null });
        return;
      }

      const auth = await api<AuthResponse>("/auth/telegram", {
        method: "POST",
        body: JSON.stringify({ initData }),
      });
      setToken(auth.token);
      setState({ status: "authed", user: auth.user, error: null });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && e.code === "BANNED") {
        const reason = readReason(e.body);
        setState({ status: "banned", user: null, error: reason });
        return;
      }
      if (
        e instanceof ApiError &&
        e.status === 403 &&
        e.code === "ACCOUNT_DELETED"
      ) {
        clearToken();
        setState({ status: "deleted", user: null, error: null });
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      setState({ status: "error", user: null, error: message });
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const signOut = useCallback(() => {
    clearToken();
    setState({ status: "needs-telegram", user: null, error: null });
  }, []);

  /** Force the deleted screen after the user themselves hits DELETE /me. */
  const markDeleted = useCallback(() => {
    clearToken();
    setState({ status: "deleted", user: null, error: null });
  }, []);

  return { ...state, refresh: run, signOut, markDeleted };
}

function readReason(body: unknown): string | null {
  if (body && typeof body === "object" && "reason" in body) {
    const r = (body as { reason: unknown }).reason;
    return typeof r === "string" && r.length > 0 ? r : null;
  }
  return null;
}

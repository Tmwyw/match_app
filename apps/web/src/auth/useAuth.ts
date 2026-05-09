import { useCallback, useEffect, useState } from "react";
import type { AuthResponse, MeResponse } from "@tg-app-meet/shared";
import { api, ApiError, clearToken, getToken, setToken } from "../api";
import { getTelegramWebApp } from "../telegram";

type State =
  | { status: "loading"; user: null; error: null }
  | { status: "authed"; user: MeResponse; error: null }
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

      // Some Telegram clients populate WebApp.initData a tick after the
      // script loads — especially on iOS after a cold reload of the
      // Mini App. If we read it the moment React mounts, it can come
      // back empty even though we ARE inside Telegram. Retry briefly
      // before showing the "open from inside Telegram" screen, which
      // is otherwise a dead-end for legitimate users.
      let initData = getTelegramWebApp()?.initData;
      if (!initData) {
        for (let i = 0; i < 10 && !initData; i += 1) {
          await new Promise((r) => setTimeout(r, 100));
          initData = getTelegramWebApp()?.initData;
        }
      }
      if (!initData) {
        // Truly outside Telegram (or a client variant that never
        // surfaces initData). Treat as the legacy "open from inside
        // Telegram" state.
        setState({ status: "needs-telegram", user: null, error: null });
        return;
      }

      const auth = await api<AuthResponse>("/auth/telegram", {
        method: "POST",
        body: JSON.stringify({ initData }),
      });
      setToken(auth.token);
      // /auth/telegram returns the slim PublicUser. Fetch /me right away
      // so we have the side-channel fields (referralCount, pendingViewProfile)
      // that the Home screen needs without an extra render flash.
      const me = await api<MeResponse>("/me");
      setState({ status: "authed", user: me, error: null });
      // Notify child screens that any in-flight data fetches that just
      // failed with 401 should be retried — fresh token is in place now.
      // (Pairs with the `creo:auth-lost` event api.ts fires on 401.)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("creo:auth-recovered"));
      }
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

  // Mid-session recovery: api.ts dispatches `creo:auth-lost` whenever a
  // request gets 401 (token expired / user hard-deleted / webview lost
  // localStorage). Re-run the auth flow — initData mints a fresh JWT
  // and creates a new User row if the old one was deleted, so the user
  // doesn't get stuck on a "missing bearer token" retry screen.
  useEffect(() => {
    const onLost = () => {
      void run();
    };
    window.addEventListener("creo:auth-lost", onLost);
    return () => window.removeEventListener("creo:auth-lost", onLost);
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

import { useCallback, useEffect, useState } from "react";
import type { AuthResponse, MeResponse, PublicUser } from "@tg-app-meet/shared";
import { api, ApiError, clearToken, getToken, setToken } from "../api";
import { getTelegramWebApp } from "../telegram";

type State =
  | { status: "loading"; user: null; error: null }
  | { status: "authed"; user: PublicUser; error: null }
  | { status: "needs-telegram"; user: null; error: null }
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

  return { ...state, refresh: run, signOut };
}

import { useCallback, useEffect, useState } from "react";
import type { MyProfileResponse } from "@tg-app-meet/shared";
import { api, ApiError } from "../api";

type ProfileState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; data: MyProfileResponse }
  | { status: "error"; error: string };

export function useProfile() {
  const [state, setState] = useState<ProfileState>({ status: "loading" });

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await api<MyProfileResponse>("/me/profile");
      setState({ status: "ready", data });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setState({ status: "missing" });
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setState({ status: "error", error: msg });
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}

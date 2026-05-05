import { useCallback, useEffect, useState } from "react";
import type { LikesCountResponse } from "@tg-app-meet/shared";
import { api } from "./api";

const POLL_INTERVAL_MS = 60_000;

/**
 * Polls /me/likes/count once a minute and on window focus. The number is
 * only ever rendered as a badge — we never reveal who liked, so there's
 * no Privacy concern with refreshing it on a timer.
 */
export function useLikesCount(): { count: number; refresh: () => void } {
  const [count, setCount] = useState(0);

  const fetchOnce = useCallback(async () => {
    try {
      const r = await api<LikesCountResponse>("/me/likes/count");
      setCount(r.count);
    } catch {
      /* swallow — not critical, badge stays at last known value */
    }
  }, []);

  useEffect(() => {
    void fetchOnce();
    const id = window.setInterval(fetchOnce, POLL_INTERVAL_MS);
    const onFocus = () => void fetchOnce();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchOnce]);

  return { count, refresh: fetchOnce };
}

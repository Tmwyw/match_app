import { useCallback, useEffect, useState } from "react";
import { type LikesCountResponse, WsServerEvents } from "@tg-app-meet/shared";
import { api } from "./api";
import { getChatSocket } from "./chat/socket";

const POLL_INTERVAL_MS = 60_000;

/**
 * Inbound-likes badge counter. Polls /me/likes/count once a minute as a
 * fallback, but the primary source of truth for "you got a new like" is
 * the WS event `likes:incoming` — fired by the API when someone LIKE-
 * swipes you. The event lets the badge bump instantly instead of
 * waiting up to 60s for the next poll. We also re-fetch on window
 * focus so the count syncs with server truth after long offline gaps.
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

    // Live bump — the API hits us via the user-room when a fresh
    // LIKE lands. Optimistic +1; the next poll reconciles with server.
    const socket = getChatSocket();
    const onIncoming = () => {
      setCount((c) => c + 1);
    };
    socket.on(WsServerEvents.LikesIncoming, onIncoming);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      socket.off(WsServerEvents.LikesIncoming, onIncoming);
    };
  }, [fetchOnce]);

  return { count, refresh: fetchOnce };
}

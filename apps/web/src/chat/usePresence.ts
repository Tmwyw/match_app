import { useEffect, useState } from "react";
import type { PresencePayload, PresenceResponse } from "@tg-app-meet/shared";
import { WsServerEvents } from "@tg-app-meet/shared";
import { api } from "../api";
import { getChatSocket } from "./socket";

/**
 * Loads initial presence for a partner via REST and then keeps it in sync
 * with `user:presence` WS pushes (only events for `userId` are kept).
 *
 * Returns null while the initial fetch is pending so the caller can
 * decide between "loading" and "offline" themselves.
 */
export function usePresence(userId: string): PresenceResponse | null {
  const [presence, setPresence] = useState<PresenceResponse | null>(null);

  useEffect(() => {
    let aborted = false;
    setPresence(null);

    api<PresenceResponse>(`/users/${userId}/presence`)
      .then((p) => {
        if (!aborted) setPresence(p);
      })
      .catch(() => {
        // 403 (not partners), 404, network — fall back to "unknown" so the
        // UI shows nothing rather than misleading "offline".
        if (!aborted) setPresence({ online: false, lastSeen: null });
      });

    const sock = getChatSocket();
    const onPresence = (payload: PresencePayload) => {
      if (payload.userId !== userId) return;
      setPresence({ online: payload.online, lastSeen: payload.lastSeen });
    };
    sock.on(WsServerEvents.Presence, onPresence);

    return () => {
      aborted = true;
      sock.off(WsServerEvents.Presence, onPresence);
    };
  }, [userId]);

  return presence;
}

import { ChevronRight, Eye, Heart } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MatchSummary,
  MatchesListResponse,
  PublicCard,
} from "@tg-app-meet/shared";
import { WsServerEvents } from "@tg-app-meet/shared";
import { api } from "../api";
import type { OpenChat } from "../App";
import { shortChatTime } from "../chat/relativeTime";
import { getChatSocket } from "../chat/socket";
import { Button, Card, CenteredMessage, Logo, RoleAvatar, Screen } from "../ui";

type State =
  | { status: "loading" }
  | { status: "ready"; data: MatchesListResponse }
  | { status: "error"; error: string };

export function MatchesList({
  onOpenChat,
  onOpenProfile,
  inboundLikesCount,
}: {
  onOpenChat: (payload: OpenChat) => void;
  /** Tap on the eye icon next to a match → opens UserCardScreen for that
   *  user's full profile (read-only, no swipe actions since there's
   *  already a match). */
  onOpenProfile: (userId: string) => void;
  /** Comes from the parent's polling hook so the banner stays in sync
   *  with the tab badge. 0 → banner hidden. */
  inboundLikesCount: number;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      // Archive tab was removed in the simplification pass — list always
      // shows active matches. Backend still has the archived flag on the
      // table, just no UI to flip it.
      const data = await api<MatchesListResponse>(`/matches?archived=false`);
      setState({ status: "ready", data });
    } catch (e) {
      setState({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Mid-session auth recovery: re-fetch matches once a fresh JWT lands.
  // Otherwise a 401 mid-session leaves the list stuck on "missing
  // bearer token" until the user manually navigates away and back.
  useEffect(() => {
    const onRecover = () => {
      void load();
    };
    window.addEventListener("creo:auth-recovered", onRecover);
    return () =>
      window.removeEventListener("creo:auth-recovered", onRecover);
  }, [load]);

  // Telegram-style live resort: when ANY message lands or gets read in
  // ANY chat I'm in, refetch so rows re-sort and the unread badges
  // refresh. We debounce so a burst of messages doesn't hammer /matches.
  // The chat-screen also subscribes to message:new for its own room —
  // both subscriptions are independent, no conflict.
  const refreshTimer = useRef<number | null>(null);
  const debouncedReload = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      void load();
    }, 400);
  }, [load]);
  useEffect(() => {
    const socket = getChatSocket();
    const onNew = () => debouncedReload();
    const onRead = () => debouncedReload();
    socket.on(WsServerEvents.MessageNew, onNew);
    socket.on(WsServerEvents.MessageRead, onRead);
    return () => {
      socket.off(WsServerEvents.MessageNew, onNew);
      socket.off(WsServerEvents.MessageRead, onRead);
      if (refreshTimer.current) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, [debouncedReload]);

  return (
    // h-full + overflow-y-auto: body has overflow: hidden globally
    // (iOS rubber-band fix), so the matches list owns its own scroll
    // container. Same pattern as MyProfile.
    <Screen className="h-full overflow-y-auto pb-safe">
      <div className="max-w-md mx-auto flex flex-col gap-3 pb-6">
        <div className="flex justify-center pt-2">
          <Logo size={64} />
        </div>
        <h1 className="text-2xl font-bold mt-1 mb-1">Мои диалоги</h1>

        {inboundLikesCount > 0 && (
          <div className="rounded-card bg-accent-muted border border-app-border px-3 py-2.5 flex items-center gap-2.5">
            <Heart size={18} className="text-accent shrink-0" fill="currentColor" />
            <p className="text-sm text-tg-text">
              Тебя лайкнули <b>{inboundLikesCount}</b>{" "}
              {plural(inboundLikesCount, "человек", "человека", "человек")}.{" "}
              <span className="text-tg-hint">Лайкни в ответ — получишь матч.</span>
            </p>
          </div>
        )}

        {state.status === "loading" && (
          <p className="text-tg-hint text-sm mt-4">загружаем…</p>
        )}
        {state.status === "error" && (
          <CenteredMessage>
            <p className="text-danger text-sm">{state.error}</p>
            <Button
              variant="secondary"
              size="md"
              onClick={load}
              className="mt-2"
            >
              retry
            </Button>
          </CenteredMessage>
        )}
        {state.status === "ready" && state.data.length === 0 && (
          <p className="text-tg-hint text-sm mt-6 text-center">
            Пока диалогов нет. Лайкай кандидатов во вкладке «Поиск».
          </p>
        )}
        {state.status === "ready" && state.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {state.data.map((m) => (
              <li key={m.matchId}>
                <MatchRow
                  m={m}
                  onOpenChat={onOpenChat}
                  onOpenProfile={onOpenProfile}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Screen>
  );
}

/**
 * One row in the Telegram-style chat list. Three states for the subtitle:
 *   - has lastMessagePreview        → "Ты: …" if I sent the last one, else
 *                                     just the preview. Plus short time
 *                                     ("18:45", "вч", "пн", "10.05") on the
 *                                     right.
 *   - no messages, profile present  → fall back to the brief profile summary
 *                                     so the row isn't empty for fresh
 *                                     matches.
 *   - no messages, deletedPlugCard  → fallback summary handles that too.
 * Unread badge appears on the right when unreadCount > 0; mutually exclusive
 * with the time label (Telegram does it the same way).
 */
function MatchRow({
  m,
  onOpenChat,
  onOpenProfile,
}: {
  m: MatchSummary;
  onOpenChat: (payload: OpenChat) => void;
  onOpenProfile: (userId: string) => void;
}) {
  const previewText = m.lastMessagePreview
    ? m.lastMessageFromMe
      ? `Ты: ${m.lastMessagePreview}`
      : m.lastMessagePreview
    : summarize(m.other);
  const previewIsMessage = m.lastMessagePreview !== null;
  const timeLabel = shortChatTime(m.lastMessageAt);
  const hasUnread = m.unreadCount > 0;
  return (
    <Card
      onClick={() =>
        onOpenChat({
          chatId: m.chatId,
          otherUserId: m.other.userId,
          otherAnonId: m.other.anonId,
          otherDisplayName: m.other.displayName,
          otherRole: m.other.role,
        })
      }
      className="flex items-center gap-3"
    >
      <RoleAvatar role={m.other.role} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold truncate">
            {m.other.displayName ?? m.other.anonId}
          </div>
          {/* Time label sits beside the name when there's an actual
              message — for matches with zero messages we don't show
              anything (a "матч от 5 мин" would be noise on a fresh
              chat). When there's unread, the badge below replaces this
              visually, but we still keep the time string so users can
              tell when the unread arrived. */}
          {previewIsMessage && timeLabel && (
            <span className="text-[11px] text-tg-hint shrink-0">
              {timeLabel}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="text-xs text-tg-hint truncate flex-1">
            {previewText}
          </div>
          {hasUnread && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-accent text-accent-text text-[10px] font-bold flex items-center justify-center">
              {m.unreadCount > 99 ? "99+" : m.unreadCount}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenProfile(m.other.userId);
        }}
        className="p-2 -m-2 text-tg-hint active:text-tg-text"
        aria-label="посмотреть профиль"
      >
        <Eye size={18} />
      </button>
      <ChevronRight size={20} className="text-tg-hint shrink-0" />
    </Card>
  );
}

function summarize(card: PublicCard): string {
  if (card.role === "BUYER") {
    const role = card.desiredPosition || card.trafficSources.join("/");
    return `${role} · ${card.geos.join(",")} · $${card.budgetMin}–${card.budgetMax}`;
  }
  const verticalish =
    card.verticals.length > 0
      ? card.verticals.join("/")
      : card.trafficSources.join("/");
  return `${card.offerName} · ${verticalish} · $${card.payoutMin}–${card.payoutMax}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

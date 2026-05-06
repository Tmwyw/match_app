import { Heart, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { PublicCard, SwipeResponse } from "@tg-app-meet/shared";
import { api, ApiError } from "../api";
import {
  AppHeader,
  Background,
  Button,
  CenteredMessage,
  MatchOverlay,
  Screen,
} from "../ui";
import { CardView } from "./CardView";

type State =
  | { status: "loading" }
  | { status: "ready"; card: PublicCard }
  | { status: "error"; error: string };

type Props = {
  userId: string;
  myRole: "BUYER" | "OWNER";
  onClose: () => void;
  /** When the deep-link tap turns into a match, the chat shortcut on the
   *  overlay should open the chat — same handler as the Deck. */
  onMatched: (payload: {
    chatId: string;
    otherUserId: string;
    otherAnonId: string;
    otherDisplayName: string | null;
    otherRole: "BUYER" | "OWNER";
  }) => void;
};

/**
 * Read-only viewer for someone else's profile, opened from a `p_<id>`
 * deep-link. Provides Like/Skip actions so the user doesn't have to
 * jump back to the deck just to react.
 */
export function UserCardScreen({ userId, myRole, onClose, onMatched }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [matchOverlay, setMatchOverlay] = useState<{
    response: SwipeResponse;
    other: PublicCard;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    setState({ status: "loading" });
    api<PublicCard>(`/users/${userId}/card`)
      .then((card) => {
        if (!aborted) setState({ status: "ready", card });
      })
      .catch((e) => {
        if (aborted) return;
        const msg =
          e instanceof ApiError && e.status === 404
            ? "Профиль недоступен."
            : e instanceof ApiError && e.status === 403
              ? "Нет доступа к этому профилю."
              : e instanceof Error
                ? e.message
                : String(e);
        setState({ status: "error", error: msg });
      });
    return () => {
      aborted = true;
    };
  }, [userId]);

  const swipe = async (action: "LIKE" | "SKIP") => {
    if (state.status !== "ready" || submitting) return;
    setSubmitting(true);
    try {
      const r = await api<SwipeResponse>("/swipes", {
        method: "POST",
        body: JSON.stringify({ toUserId: state.card.userId, action }),
      });
      if (r.matched) {
        setMatchOverlay({ response: r, other: state.card });
      } else {
        setToast(action === "LIKE" ? "Лайк отправлен." : "Пропущено.");
        setTimeout(() => setToast(null), 2000);
        // Auto-close after the gesture so the user returns to the deck.
        setTimeout(onClose, 600);
      }
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      setToast(msg);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto">
      <Background />
      <Screen className="relative z-10 pb-safe min-h-screen">
        <div className="max-w-md mx-auto flex flex-col gap-4">
          <AppHeader title="Профиль" onBack={onClose} />

          {state.status === "loading" && (
            <CenteredMessage>
              <p className="text-tg-hint text-sm">загружаем…</p>
            </CenteredMessage>
          )}
          {state.status === "error" && (
            <CenteredMessage>
              <p className="text-danger text-sm">{state.error}</p>
              <Button variant="secondary" size="md" onClick={onClose} className="mt-2">
                Закрыть
              </Button>
            </CenteredMessage>
          )}
          {state.status === "ready" && (
            <>
              <CardView card={state.card} />
              <div className="flex items-center gap-3 mt-2">
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={submitting}
                  onClick={() => swipe("SKIP")}
                >
                  <X size={18} />
                  Пропустить
                </Button>
                <Button
                  variant="primary"
                  fullWidth
                  disabled={submitting}
                  onClick={() => swipe("LIKE")}
                >
                  <Heart size={18} fill="currentColor" />
                  Лайк
                </Button>
              </div>
            </>
          )}
        </div>
      </Screen>

      {toast && (
        <div className="fixed bottom-24 left-0 right-0 flex justify-center px-4 pointer-events-none">
          <div className="rounded-button bg-card border border-app-border px-4 py-2 text-sm text-tg-text">
            {toast}
          </div>
        </div>
      )}

      {matchOverlay && matchOverlay.response.chatId && (
        <MatchOverlay
          myRole={myRole}
          otherRole={matchOverlay.other.role}
          otherAnonId={matchOverlay.other.displayName ?? matchOverlay.other.anonId}
          onChat={() => {
            const chatId = matchOverlay.response.chatId!;
            const other = matchOverlay.other;
            setMatchOverlay(null);
            onMatched({
              chatId,
              otherUserId: other.userId,
              otherAnonId: other.anonId,
              otherDisplayName: other.displayName,
              otherRole: other.role,
            });
          }}
          onContinue={() => {
            setMatchOverlay(null);
            onClose();
          }}
        />
      )}
    </div>
  );
}

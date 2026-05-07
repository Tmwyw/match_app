import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { Filter, Heart, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DiscoverFilters,
  DiscoverResponse,
  PublicCard,
  Role,
  SwipeAction,
  SwipeResponse,
} from "@tg-app-meet/shared";
import { api, ApiError } from "../api";
import type { OpenChat } from "../App";
import { useLocalStorageState } from "../useLocalStorageState";
import {
  BigActionButton,
  Button,
  CenteredMessage,
  MatchOverlay,
  Screen,
} from "../ui";
import { CardView } from "./CardView";
import { FilterSheet } from "./FilterSheet";

type DeckState =
  | { status: "loading" }
  | { status: "needs-profile" }
  | { status: "empty" }
  | { status: "ready"; card: PublicCard; remaining: number }
  | { status: "error"; error: string };

const SWIPE_THRESHOLD = 100;
const UNDO_VISIBLE_MS = 5_000;

export function Deck({
  myRole,
  onMatched,
}: {
  myRole: Role;
  onMatched: (payload: OpenChat) => void;
}) {
  const [state, setState] = useState<DeckState>({ status: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [overlay, setOverlay] = useState<{
    response: SwipeResponse;
    otherUserId: string;
    otherRole: Role;
    otherAnonId: string;
    otherDisplayName: string | null;
  } | null>(null);
  const [filters, setFilters] = useLocalStorageState<DiscoverFilters>(
    "discover_filters",
    { verticals: [], geos: [] },
  );
  const [filterOpen, setFilterOpen] = useState(false);

  // Undo tracker — populated after every successful swipe; auto-clears after
  // 5s. The button calls DELETE /swipes/last and reloads.
  const [undoVisible, setUndoVisible] = useState(false);
  const [undoToast, setUndoToast] = useState<string | null>(null);
  const undoTimer = useRef<number | null>(null);

  const filtersQs =
    (filters.verticals.length ? `verticals=${filters.verticals.join(",")}` : "") +
    (filters.geos.length
      ? `${filters.verticals.length ? "&" : ""}geos=${filters.geos.join(",")}`
      : "");

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await api<DiscoverResponse>(
        `/discover${filtersQs ? `?${filtersQs}` : ""}`,
      );
      if (!data.card) {
        setState({ status: "empty" });
      } else {
        setState({ status: "ready", card: data.card, remaining: data.remaining });
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setState({ status: "needs-profile" });
      } else {
        setState({
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }, [filtersQs]);

  useEffect(() => {
    void load();
  }, [load]);

  const showUndoToast = (msg: string) => {
    setUndoToast(msg);
    window.setTimeout(() => setUndoToast(null), 3000);
  };

  const armUndo = () => {
    setUndoVisible(true);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => {
      setUndoVisible(false);
      undoTimer.current = null;
    }, UNDO_VISIBLE_MS);
  };

  const swipe = async (action: SwipeAction) => {
    if (state.status !== "ready" || submitting) return;
    const card = state.card;
    setSubmitting(true);
    try {
      const r = await api<SwipeResponse>("/swipes", {
        method: "POST",
        body: JSON.stringify({ toUserId: card.userId, action }),
      });
      if (r.matched) {
        setOverlay({
          response: r,
          otherUserId: card.userId,
          otherRole: card.role,
          otherAnonId: card.anonId,
          otherDisplayName: card.displayName,
        });
      } else {
        // Only offer undo for non-match outcomes — undoing a match is the
        // server-side 409 case anyway, so don't show the affordance.
        armUndo();
      }
      await load();
    } catch (e) {
      setState({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const undo = async () => {
    setUndoVisible(false);
    try {
      await api("/swipes/last", { method: "DELETE" });
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        showUndoToast("Уже сматчились, отменить нельзя.");
      } else if (e instanceof ApiError && e.status === 404) {
        showUndoToast("Нет свайпа для отмены.");
      } else {
        showUndoToast(e instanceof Error ? e.message : String(e));
      }
    }
  };

  if (state.status === "loading") {
    return (
      <CenteredMessage>
        <p className="text-tg-hint text-sm">ищем кандидата…</p>
      </CenteredMessage>
    );
  }
  if (state.status === "needs-profile") {
    return (
      <CenteredMessage>
        <p className="text-tg-hint text-sm">Сначала заполни профиль.</p>
      </CenteredMessage>
    );
  }
  if (state.status === "error") {
    return (
      <CenteredMessage>
        <p className="text-danger text-sm">{state.error}</p>
        <Button variant="secondary" size="md" onClick={load} className="mt-2">
          retry
        </Button>
      </CenteredMessage>
    );
  }
  if (state.status === "empty") {
    return (
      <Screen className="flex flex-col gap-4 min-h-screen">
        <Header
          onOpenFilters={() => setFilterOpen(true)}
          activeFilterCount={filters.verticals.length + filters.geos.length}
        />
        <CenteredMessage>
          <p className="text-tg-hint text-sm">
            {filters.verticals.length + filters.geos.length > 0
              ? "С такими фильтрами никого. Попробуй ослабить."
              : "Пока больше никого. Загляни позже."}
          </p>
          <Button variant="secondary" size="md" onClick={load} className="mt-2">
            обновить
          </Button>
        </CenteredMessage>
        {filterOpen && (
          <FilterSheet
            initial={filters}
            onClose={() => setFilterOpen(false)}
            onApply={(next) => {
              setFilters(next);
              setFilterOpen(false);
            }}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen className="flex flex-col gap-4 min-h-screen">
      <Header
        onOpenFilters={() => setFilterOpen(true)}
        activeFilterCount={filters.verticals.length + filters.geos.length}
        remaining={state.remaining}
      />
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col gap-5">
        <DraggableCard
          card={state.card}
          disabled={submitting}
          onLike={() => swipe("LIKE")}
          onSkip={() => swipe("SKIP")}
        />
        <div className="flex items-center justify-center gap-8 pt-2">
          <BigActionButton
            variant="danger"
            ariaLabel="Skip"
            disabled={submitting}
            onClick={() => swipe("SKIP")}
            icon={<X size={28} strokeWidth={2.5} />}
          />
          <BigActionButton
            variant="info"
            ariaLabel="Like"
            disabled={submitting}
            onClick={() => swipe("LIKE")}
            icon={<Heart size={28} fill="currentColor" />}
          />
        </div>
      </div>

      {undoVisible && (
        <div className="fixed bottom-28 left-0 right-0 flex justify-center z-40 px-4">
          <button
            type="button"
            onClick={undo}
            className="flex items-center gap-2 rounded-button bg-card border border-app-border-strong shadow-action px-4 py-2 text-sm text-tg-text active:scale-[0.98]"
          >
            <Undo2 size={16} />
            Отменить
          </button>
        </div>
      )}
      {undoToast && (
        <div className="fixed bottom-28 left-0 right-0 flex justify-center z-40 px-4">
          <div className="rounded-button bg-card border border-app-border px-3 py-2 text-xs text-tg-hint">
            {undoToast}
          </div>
        </div>
      )}

      {overlay && (
        <MatchOverlay
          myRole={myRole}
          otherRole={overlay.otherRole}
          otherAnonId={overlay.otherDisplayName ?? overlay.otherAnonId}
          onChat={() => {
            const { chatId } = overlay.response;
            const payload = chatId
              ? {
                  chatId,
                  otherUserId: overlay.otherUserId,
                  otherAnonId: overlay.otherAnonId,
                  otherDisplayName: overlay.otherDisplayName,
                  otherRole: overlay.otherRole,
                }
              : null;
            setOverlay(null);
            if (payload) onMatched(payload);
          }}
          onContinue={() => setOverlay(null)}
        />
      )}

      {filterOpen && (
        <FilterSheet
          initial={filters}
          onClose={() => setFilterOpen(false)}
          onApply={(next) => {
            setFilters(next);
            setFilterOpen(false);
          }}
        />
      )}
    </Screen>
  );
}

function Header({
  remaining,
  activeFilterCount,
  onOpenFilters,
}: {
  remaining?: number;
  activeFilterCount: number;
  onOpenFilters: () => void;
}) {
  return (
    <div className="max-w-md w-full mx-auto flex items-center justify-between">
      {remaining !== undefined ? (
        <p className="text-tg-hint text-xs">ещё ~{remaining} в очереди</p>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onOpenFilters}
        className="relative p-2 -m-2 text-tg-hint active:text-tg-text"
        aria-label="фильтры"
      >
        <Filter size={18} />
        {activeFilterCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-accent-text text-[10px] font-bold flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
      </button>
    </div>
  );
}

/**
 * Wraps CardView with a horizontal drag gesture (Tinder-style):
 *  - Drag past the threshold OR fling fast enough → fly off in that direction
 *    over ~250ms, then commit the swipe action.
 *  - Drag inside the threshold → spring back to centre.
 *  - LIKE/SKIP from the bottom buttons also trigger the same fly-off so
 *    button taps look identical to gestures.
 *  - card.userId in the key forces a fresh DraggableCard tree per candidate,
 *    which resets the motion value to 0 cleanly between swipes.
 */
function DraggableCard({
  card,
  disabled,
  onLike,
  onSkip,
}: {
  card: PublicCard;
  disabled: boolean;
  onLike: () => void;
  onSkip: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-18, 0, 18]);
  const likeOpacity = useTransform(x, [0, 100], [0, 0.7]);
  const skipOpacity = useTransform(x, [-100, 0], [0.7, 0]);
  const opacity = useTransform(x, [-400, -200, 0, 200, 400], [0, 1, 1, 1, 0]);
  const flying = useRef(false);

  const flyOff = (direction: 1 | -1, after: () => void) => {
    if (flying.current) return;
    flying.current = true;
    animate(x, direction * window.innerWidth * 1.2, {
      type: "tween",
      duration: 0.28,
      ease: "easeOut",
    }).then(() => {
      after();
      flying.current = false;
    });
  };

  return (
    <motion.div
      key={card.userId}
      style={{ x, rotate, opacity, touchAction: "pan-y" }}
      drag={disabled ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={(_, info) => {
        const dx = info.offset.x;
        const vx = info.velocity.x;
        const fastFling = Math.abs(vx) > 600;
        if (dx > SWIPE_THRESHOLD || (fastFling && vx > 0)) {
          flyOff(1, onLike);
        } else if (dx < -SWIPE_THRESHOLD || (fastFling && vx < 0)) {
          flyOff(-1, onSkip);
        }
      }}
      className="relative cursor-grab active:cursor-grabbing"
    >
      <motion.div
        style={{ opacity: likeOpacity }}
        className="pointer-events-none absolute inset-0 rounded-card bg-success/30 z-10"
      />
      <motion.div
        style={{ opacity: skipOpacity }}
        className="pointer-events-none absolute inset-0 rounded-card bg-danger/30 z-10"
      />
      <CardView card={card} />
    </motion.div>
  );
}

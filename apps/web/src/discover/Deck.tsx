import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { Filter, Heart, RotateCcw, Undo2, X } from "lucide-react";
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
  Logo,
  MatchOverlay,
  Screen,
} from "../ui";
import { CardView } from "./CardView";
import { FilterSheet } from "./FilterSheet";

/**
 * Deck state:
 *   - loading / needs-profile / error: first-load conditions
 *   - ok: we have a queue of 0-2 cards. queue[0] is the active draggable
 *     card; queue[1] (if present) is rendered as a backdrop slightly
 *     scaled-down behind it. After the top swipes off, the backdrop
 *     animates up to "top position" while a fresh card is fetched in
 *     the background and pushed to position 1.
 */
type DeckState =
  | { status: "loading" }
  | { status: "needs-profile" }
  | { status: "error"; error: string }
  | { status: "ok"; queue: PublicCard[]; remaining: number };

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
  // 5s. The button calls DELETE /swipes/last and reloads the whole stack.
  const [undoVisible, setUndoVisible] = useState(false);
  const [undoToast, setUndoToast] = useState<string | null>(null);
  const undoTimer = useRef<number | null>(null);

  const buildQs = useCallback(
    (excludeIds: string[]) => {
      const qs = new URLSearchParams();
      if (filters.verticals.length)
        qs.set("verticals", filters.verticals.join(","));
      if (filters.geos.length) qs.set("geos", filters.geos.join(","));
      if (excludeIds.length) qs.set("exclude", excludeIds.join(","));
      const tail = qs.toString();
      return tail ? `?${tail}` : "";
    },
    [filters.verticals, filters.geos],
  );

  const fetchOne = useCallback(
    async (excludeIds: string[]) => {
      return api<DiscoverResponse>(`/discover${buildQs(excludeIds)}`);
    },
    [buildQs],
  );

  /** Initial load: pull two cards in sequence so the deck has a backdrop
   *  ready before the user even touches the top one. */
  const loadInitial = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const first = await fetchOne([]);
      if (!first.card) {
        setState({ status: "ok", queue: [], remaining: 0 });
        return;
      }
      const second = await fetchOne([first.card.userId]);
      const queue: PublicCard[] = second.card
        ? [first.card, second.card]
        : [first.card];
      setState({ status: "ok", queue, remaining: first.remaining });
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
  }, [fetchOne]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

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

  /** Push the active card off, advance the queue, and lazily refill the
   *  backdrop slot in the background. The fly-off animation has already
   *  finished by the time DraggableCard calls this — that's why the
   *  pop/visual swap reads as one continuous motion. */
  const swipe = async (action: SwipeAction) => {
    if (state.status !== "ok" || state.queue.length === 0 || submitting) return;
    const top = state.queue[0]!;
    setSubmitting(true);
    try {
      const r = await api<SwipeResponse>("/swipes", {
        method: "POST",
        body: JSON.stringify({ toUserId: top.userId, action }),
      });
      if (r.matched) {
        setOverlay({
          response: r,
          otherUserId: top.userId,
          otherRole: top.role,
          otherAnonId: top.anonId,
          otherDisplayName: top.displayName,
        });
      } else {
        armUndo();
      }
      // Pop top synchronously — backdrop card scales up to top position.
      const popped = state.queue.slice(1);
      setState({
        status: "ok",
        queue: popped,
        remaining: Math.max(0, state.remaining - 1),
      });
      // Fetch new backdrop in background. Skip if there's nothing left.
      const excludeIds = popped.map((c) => c.userId);
      fetchOne(excludeIds)
        .then((next) => {
          if (next.card) {
            setState((s) => {
              if (s.status !== "ok") return s;
              if (s.queue.length >= 2) return s; // user swiped again already
              return { ...s, queue: [...s.queue, next.card!] };
            });
          }
        })
        .catch(() => {
          /* refill is best-effort; user can still swipe what's there */
        });
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
      await loadInitial();
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
        <Button
          variant="secondary"
          size="md"
          onClick={loadInitial}
          className="mt-2"
        >
          retry
        </Button>
      </CenteredMessage>
    );
  }
  if (state.queue.length === 0) {
    return (
      <Screen className="flex flex-col gap-4 min-h-screen">
        <div className="flex justify-center pt-2">
          <Logo size={64} />
        </div>
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
          <div className="flex flex-col gap-2 mt-3 w-full max-w-xs">
            <Button variant="secondary" size="md" onClick={loadInitial}>
              обновить
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={async () => {
                try {
                  await api<{ removed: number }>("/me/swipes", {
                    method: "DELETE",
                  });
                  await loadInitial();
                } catch {
                  /* swallow — user can hit обновить */
                }
              }}
            >
              <RotateCcw size={16} />
              Смотреть заново
            </Button>
          </div>
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
      <div className="flex justify-center pt-2">
        <Logo size={64} />
      </div>
      <Header
        onOpenFilters={() => setFilterOpen(true)}
        activeFilterCount={filters.verticals.length + filters.geos.length}
        remaining={state.remaining}
      />
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col gap-5">
        <DeckStack
          queue={state.queue}
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
 * Renders the queue as a stack: queue[0] is the active draggable card,
 * queue[1] sits behind at scale-95 / lower opacity. When queue updates,
 * cards keyed by userId smoothly transition between positions.
 */
function DeckStack({
  queue,
  disabled,
  onLike,
  onSkip,
}: {
  queue: PublicCard[];
  disabled: boolean;
  onLike: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="relative">
      {queue.map((card, i) => {
        const isTop = i === 0;
        return (
          <motion.div
            key={card.userId}
            // Backdrop card: scale-down + downward shift + blur out the
            // contents. When the top is swiped off, framer animates this
            // card up to {scale:1, y:0, opacity:1, blur:0} — that reveal
            // is the "card lifting up" Tinder feel.
            //
            // overflow-hidden on the backdrop wrapper clips its CardView
            // to the top card's height (parent's flow height = top card),
            // so a longer backdrop card can't bleed into the action-button
            // gap below the deck.
            initial={false}
            animate={{
              scale: isTop ? 1 : 0.95,
              y: isTop ? 0 : 14,
              opacity: isTop ? 1 : 0.5,
              filter: isTop ? "blur(0px)" : "blur(10px)",
            }}
            transition={{ type: "tween", duration: 0.28, ease: "easeOut" }}
            className={
              isTop
                ? "relative"
                : "absolute inset-0 overflow-hidden rounded-card"
            }
            style={{
              zIndex: queue.length - i,
              pointerEvents: isTop ? "auto" : "none",
            }}
          >
            {isTop ? (
              <DraggableCard
                card={card}
                disabled={disabled}
                onLike={onLike}
                onSkip={onSkip}
              />
            ) : (
              <CardView card={card} />
            )}
          </motion.div>
        );
      })}
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
  // Stamps and tint reach full opacity at ~80px of drag — keeps the
  // feedback snappy without flashing on tiny finger jitter.
  const likeOpacity = useTransform(x, [10, 80], [0, 1]);
  const skipOpacity = useTransform(x, [-80, -10], [1, 0]);
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
      {/* Ambient color wash so the whole card tints in the swipe direction */}
      <motion.div
        style={{ opacity: likeOpacity }}
        className="pointer-events-none absolute inset-0 rounded-card bg-success/20 z-10"
      />
      <motion.div
        style={{ opacity: skipOpacity }}
        className="pointer-events-none absolute inset-0 rounded-card bg-danger/20 z-10"
      />

      {/* Tinder-style outlined stamps — big bold text, thick coloured border,
          empty fill, rotated like a rubber stamp. Convention: stamp appears
          on the side OPPOSITE to the drag direction (drag right → LIKE
          stamp anchors to the left), like a stamp left behind as the card
          flies away. They sit at top so they read above the card content
          regardless of card length. */}
      <motion.div
        style={{ opacity: likeOpacity }}
        className="pointer-events-none absolute top-10 left-6 z-30 -rotate-[14deg]"
      >
        <div className="border-[5px] border-success rounded-2xl px-6 py-3 bg-success/15 backdrop-blur-md shadow-[0_0_30px_rgba(16,185,129,0.45)]">
          <span className="text-success text-4xl font-black tracking-[0.2em]">
            ЛАЙК
          </span>
        </div>
      </motion.div>

      <motion.div
        style={{ opacity: skipOpacity }}
        className="pointer-events-none absolute top-10 right-6 z-30 rotate-[14deg]"
      >
        <div className="border-[5px] border-danger rounded-2xl px-6 py-3 bg-danger/15 backdrop-blur-md shadow-[0_0_30px_rgba(239,68,68,0.45)]">
          <span className="text-danger text-4xl font-black tracking-[0.2em]">
            ПРОПУСК
          </span>
        </div>
      </motion.div>

      <CardView card={card} />
    </motion.div>
  );
}

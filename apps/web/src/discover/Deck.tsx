import {
  animate,
  motion,
  type MotionValue,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { Filter, Heart, RotateCcw, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

/**
 * Device detection — phone/tablet vs mouse/trackpad. Used to tune the
 * commit threshold tighter on mouse so cursor jitter doesn't trigger.
 */
const IS_TOUCH =
  typeof window !== "undefined" &&
  window.matchMedia?.("(pointer: coarse)").matches;

/**
 * Two paths to commit a swipe (either-or):
 *
 *   1. Power: |offset| × peak-velocity > confidence — captures fast
 *      flicks even when the drag was short. Threshold per input type.
 *   2. Distance: drag exceeded a % of card width — captures slow
 *      drags where velocity reads as 0 (Telegram iOS WebView often
 *      reports velocity unreliably; without this fallback, slow long
 *      drags wouldn't commit because power = anything × 0 = 0).
 *
 * Touch profile is permissive (small thumb flicks should land);
 * mouse profile is strict (click-drag jitter shouldn't swipe).
 */
const SWIPE_CONFIDENCE = IS_TOUCH ? 6000 : 10000;
const SWIPE_DISTANCE_FRACTION = IS_TOUCH ? 0.22 : 0.32;
const SWIPE_DISTANCE_MIN_PX = IS_TOUCH ? 70 : 110;
const swipePower = (offset: number, velocity: number) =>
  Math.abs(offset) * velocity;

/** Visual-ramp threshold — purely for the cyan/red glow opacity. Decoupled
 *  from commit logic above because power has no single distance equivalent.
 *  25% of card width feels "this is the commit zone" without false promise. */
const VISUAL_FRACTION = 0.25;
const VISUAL_MIN_PX = 70;

/** Dev-only swipe debug overlay. Activate via `?debug=swipe` in the
 *  URL (or set `localStorage["creo:debug-swipe"]="1"`). When on, the
 *  card paints a small panel in the top-left showing live offset,
 *  velocity, computed power, and whether the current gesture would
 *  commit. Lets us tune thresholds against real-device measurements. */
const SWIPE_DEBUG =
  typeof window !== "undefined" &&
  (new URLSearchParams(window.location.search).get("debug") === "swipe" ||
    (() => {
      try {
        return window.localStorage.getItem("creo:debug-swipe") === "1";
      } catch {
        return false;
      }
    })());
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

  // Lifted drag-x: lives at the Deck level so the side stamps (rendered
  // outside the card silhouette) can react to the drag. DraggableCard
  // receives this same MotionValue, so card transform + stamp opacity
  // share one source of truth. We reset to 0 every time the top card
  // changes, otherwise the new card would inherit the previous fly-off
  // position (~window.innerWidth) on mount.
  const x = useMotionValue(0);
  const topUserId =
    state.status === "ok" && state.queue.length > 0
      ? state.queue[0]!.userId
      : null;
  useEffect(() => {
    x.set(0);
  }, [topUserId, x]);

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
              Обновить
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
    // No overflow-hidden on the outer Screen — it was clipping the
    // action-row drop-shadow into a rectangle. Card content is still
    // clipped by the inner deck slot's own overflow-hidden.
    <Screen className="flex flex-col gap-3 h-full">
      <div className="flex justify-center pt-2 shrink-0">
        <Logo size={64} />
      </div>
      <Header
        onOpenFilters={() => setFilterOpen(true)}
        activeFilterCount={filters.verticals.length + filters.geos.length}
        remaining={state.remaining}
      />
      {/* Outer container — no overflow-hidden anywhere along the drag
          path. CardView's Card already has `overflow-hidden rounded-card`
          which clips its own content to the rounded silhouette. Letting
          the deck slot and per-card motion wrapper bleed means the card
          flies cleanly off-screen during drag instead of being clipped
          at the column's edge. */}
      <div className="max-w-md w-full mx-auto flex-1 min-h-0 flex flex-col gap-3">
        <div className="flex-1 min-h-0 relative">
          <DeckStack
            queue={state.queue}
            disabled={submitting}
            onLike={() => swipe("LIKE")}
            onSkip={() => swipe("SKIP")}
            x={x}
          />
        </div>
        <div className="flex items-center justify-center gap-8 pt-1 pb-2 shrink-0">
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
        {/* Undo toast — rendered as a flex child UNDER the action buttons
            instead of fixed-positioned. The previous `fixed bottom-28`
            placed it inside the action-button row's vertical band (96–160
            px from screen bottom thanks to App's pb-24) so it overlapped
            the X/Heart. In-flow placement guarantees it sits below the
            buttons regardless of viewport size. */}
        {(undoVisible || undoToast) && (
          <div className="flex justify-center shrink-0 pb-1">
            {undoVisible && (
              <button
                type="button"
                onClick={undo}
                className="flex items-center gap-2 rounded-button bg-card border border-app-border-strong shadow-action px-4 py-2 text-sm text-tg-text active:scale-[0.98]"
              >
                <Undo2 size={16} />
                Отменить
              </button>
            )}
            {undoToast && (
              <div className="rounded-button bg-card border border-app-border px-3 py-2 text-xs text-tg-hint">
                {undoToast}
              </div>
            )}
          </div>
        )}
      </div>

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
  x,
}: {
  queue: PublicCard[];
  disabled: boolean;
  onLike: () => void;
  onSkip: () => void;
  x: MotionValue<number>;
}) {
  return (
    <div className="absolute inset-0">
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
            // Both top and backdrop fill the parent box (absolute inset-0)
            // so neither's natural height pushes the layout. Card content
            // that overflows is clipped to the deck box.
            initial={false}
            animate={{
              scale: isTop ? 1 : 0.95,
              y: isTop ? 0 : 14,
              opacity: isTop ? 1 : 0.5,
              filter: isTop ? "blur(0px)" : "blur(10px)",
            }}
            transition={{ type: "tween", duration: 0.28, ease: "easeOut" }}
            // No overflow-hidden — would clip the dragged card at the
            // slot edge mid-fly-off. CardView's Card carries its own
            // `overflow-hidden rounded-card` so the visible silhouette
            // stays clean.
            className="absolute inset-0 rounded-card"
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
                x={x}
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
  x,
}: {
  card: PublicCard;
  disabled: boolean;
  onLike: () => void;
  onSkip: () => void;
  x: MotionValue<number>;
}) {
  // Measure the actual card width so the swipe threshold scales with
  // the device. Without this a 150-px hard-coded threshold meant ~47%
  // of card width on a 320-px phone vs ~33% on a 448-px tablet — wildly
  // different "feel" across devices.
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardWidth, setCardWidth] = useState(0);
  useLayoutEffect(() => {
    if (cardRef.current) {
      setCardWidth(cardRef.current.offsetWidth);
    }
  }, []);
  // Re-measure on resize / orientation change so the threshold tracks
  // viewport changes (e.g. user rotates phone).
  useEffect(() => {
    if (!cardRef.current) return;
    const node = cardRef.current;
    const ro = new ResizeObserver(() => {
      if (node) setCardWidth(node.offsetWidth);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const visualThreshold = Math.max(VISUAL_MIN_PX, cardWidth * VISUAL_FRACTION);
  // Velocity at release. We track the LAST onDrag sample (≈ the velocity
  // in the final ~16ms before the user lifted their finger). This is
  // direction-aware automatically — if the user dragged right then
  // pulled back to centre, the last sample is leftward (negative), so
  // power computed against the final dx position naturally registers
  // a cancel rather than a delayed commit.
  //
  // Per-direction peak tracking was tried first and was wrong: peak
  // captures the historical max velocity in each direction, which
  // doesn't decay when the user reverses. A right-flick-then-cancel
  // kept rightPeak at 1500, so power=|dx|×1500 still committed right
  // even when the user clearly aborted.
  const lastVelocity = useRef(0);

  // Debug-overlay live values — only state-driven when the overlay is
  // active so production builds pay no extra render cost.
  const [debugDx, setDebugDx] = useState(0);
  const [debugVx, setDebugVx] = useState(0);

  const rotate = useTransform(x, [-300, 0, 300], [-15, 0, 15]);
  // Tint and edge-glow opacity ramp up over a fixed visual threshold
  // (decoupled from commit logic which uses combined offset×velocity
  // power). Full saturation around 25% of card width.
  const likeOpacity = useTransform(x, [20, visualThreshold], [0, 1]);
  const skipOpacity = useTransform(x, [-visualThreshold, -20], [1, 0]);
  const opacity = useTransform(x, [-400, -200, 0, 200, 400], [0, 1, 1, 1, 0]);
  // Card-edge glow that mirrors the tint — colour gets stronger as the
  // user commits to the gesture.
  const likeGlow = useTransform(
    likeOpacity,
    // Brand cyan rgb 47,182,255 — was success green; aligned with the
    // accent palette so swipe-right matches the rest of the brand.
    (v) => `0 0 ${20 + 40 * v}px ${v * 18}px rgba(47, 182, 255, ${0.35 * v})`,
  );
  const skipGlow = useTransform(
    skipOpacity,
    (v) => `0 0 ${20 + 40 * v}px ${v * 18}px rgba(239, 68, 68, ${0.35 * v})`,
  );
  const flying = useRef(false);

  const flyOff = (direction: 1 | -1, after: () => void) => {
    if (flying.current) return;
    flying.current = true;
    // Slightly slower than the previous 0.28s to read as smoother — the
    // user reported the old timing as "слишком резко". easeOut keeps
    // the start fast (so the gesture "completes" instantly) while the
    // tail decelerates.
    animate(x, direction * window.innerWidth * 1.2, {
      type: "tween",
      duration: 0.36,
      ease: [0.25, 0.46, 0.45, 0.94],
    }).then(() => {
      // Snap x back to 0 BEFORE triggering the swipe handler. Since x is
      // now lifted to the Deck level (so the side stamps can subscribe),
      // the freshly-mounted next card would otherwise inherit the
      // fly-off transform and render off-screen for one frame.
      x.set(0);
      after();
      flying.current = false;
    });
  };

  return (
    <motion.div
      key={card.userId}
      ref={cardRef}
      style={{ x, rotate, opacity, touchAction: "pan-y" }}
      drag={disabled ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={1}
      // Snap-back physics for non-committing drags. Default framer
      // tuning is springy/wobbly — slowed down with more damping so
      // the card eases back to centre without overshoot when the user
      // releases mid-drag.
      dragTransition={{ bounceStiffness: 350, bounceDamping: 30 }}
      onDrag={(_, info) => {
        // Capture the most recent velocity sample. By the time
        // onDragEnd fires we use this as the "release velocity"
        // because info.velocity at end is unreliable on some
        // webviews (Telegram iOS reports 0 when the user paused
        // before lifting).
        lastVelocity.current = info.velocity.x;
        if (SWIPE_DEBUG) {
          setDebugDx(info.offset.x);
          setDebugVx(info.velocity.x);
        }
      }}
      onDragEnd={(_, info) => {
        const dx = info.offset.x;
        const lastVx = lastVelocity.current || info.velocity.x;
        // Cancel detection: if the velocity at release points the
        // OPPOSITE way from the final dx, the user was reversing /
        // pulling back. Don't honour that velocity — it would
        // either commit the wrong direction (lastVx points back) or
        // commit the original direction (peak-tracking variant).
        // Treat as if the gesture had no momentum; only the distance
        // fallback can still commit, and that requires the user to
        // have dragged genuinely far.
        const sameDirection =
          (dx > 0 && lastVx > 0) || (dx < 0 && lastVx < 0);
        const vx = sameDirection ? lastVx : 0;

        // Path 1 — power: combined offset × velocity for fast flicks.
        // Signed comparison both ways (positive power = rightward,
        // negative = leftward).
        const power = swipePower(dx, vx);
        const rightPower = power > SWIPE_CONFIDENCE;
        const leftPower = power < -SWIPE_CONFIDENCE;
        // Path 2 — pure distance: catches slow drags whose velocity
        // reads as 0 on the iOS webview, and rescues legitimate
        // commits where the user paused at the destination before
        // releasing.
        const distanceThreshold = Math.max(
          SWIPE_DISTANCE_MIN_PX,
          cardWidth * SWIPE_DISTANCE_FRACTION,
        );
        const rightDistance = dx > 0 && dx >= distanceThreshold;
        const leftDistance = dx < 0 && -dx >= distanceThreshold;

        if (rightPower || rightDistance) {
          flyOff(1, onLike);
        } else if (leftPower || leftDistance) {
          flyOff(-1, onSkip);
        }
        lastVelocity.current = 0;
      }}
      // h-full + w-full so the inner CardView's `h-full` has a definite
      // box to resolve against — without these the card collapsed to 0
      // and only the action buttons were visible inside the deck slot.
      className="relative w-full h-full cursor-grab active:cursor-grabbing"
    >
      {/* Whole-card tint that picks up the swipe colour. Plus an outer
          glow on the card itself (driven by likeGlow / skipGlow motion
          values below) so the cyan/red signal reads even on a passing
          glance. LIKE = brand cyan (matches the heart action button),
          SKIP = brand red. */}
      <motion.div
        style={{ opacity: likeOpacity }}
        className="pointer-events-none absolute inset-0 rounded-card bg-accent/30 z-10"
      />
      <motion.div
        style={{ opacity: skipOpacity }}
        className="pointer-events-none absolute inset-0 rounded-card bg-danger/30 z-10"
      />
      <motion.div
        style={{ opacity: likeOpacity, boxShadow: likeGlow }}
        className="pointer-events-none absolute inset-0 rounded-card border-[3px] border-accent z-10"
      />
      <motion.div
        style={{ opacity: skipOpacity, boxShadow: skipGlow }}
        className="pointer-events-none absolute inset-0 rounded-card border-[3px] border-danger z-10"
      />

      <CardView card={card} />

      {SWIPE_DEBUG && (
        <SwipeDebugOverlay
          cardWidth={cardWidth}
          dx={debugDx}
          vx={debugVx}
        />
      )}
    </motion.div>
  );
}

/** On-screen panel showing the live drag numbers. Only rendered when
 *  SWIPE_DEBUG is on (URL `?debug=swipe`). Helps tune thresholds
 *  against real-device touch behaviour. */
function SwipeDebugOverlay({
  cardWidth,
  dx,
  vx,
}: {
  cardWidth: number;
  dx: number;
  vx: number;
}) {
  // Match the actual onDragEnd logic exactly — signed power compared
  // against ±SWIPE_CONFIDENCE plus directional distance fallback.
  const power = swipePower(dx, vx);
  const distancePct = cardWidth ? (Math.abs(dx) / cardWidth) * 100 : 0;
  const distanceThreshold = Math.max(
    SWIPE_DISTANCE_MIN_PX,
    cardWidth * SWIPE_DISTANCE_FRACTION,
  );
  const rightPower = power > SWIPE_CONFIDENCE;
  const leftPower = power < -SWIPE_CONFIDENCE;
  const rightDist = dx > 0 && dx >= distanceThreshold;
  const leftDist = dx < 0 && -dx >= distanceThreshold;
  const powerCommit = rightPower || leftPower;
  const distanceCommit = rightDist || leftDist;
  const wouldCommit = powerCommit || distanceCommit;
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        zIndex: 60,
        padding: "6px 10px",
        background: "rgba(0,0,0,0.85)",
        color: "#fff",
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        lineHeight: 1.4,
        borderRadius: 8,
        pointerEvents: "none",
      }}
    >
      <div>cardW: {cardWidth}</div>
      <div>
        dx: {dx.toFixed(0)} ({distancePct.toFixed(0)}%)
      </div>
      <div>vx: {vx.toFixed(0)}</div>
      <div style={{ color: powerCommit ? "#10b981" : "#9ca3af" }}>
        power: {power.toFixed(0)} / ±{SWIPE_CONFIDENCE}{" "}
        {powerCommit ? "✓" : ""}
      </div>
      <div style={{ color: distanceCommit ? "#10b981" : "#9ca3af" }}>
        dist: {Math.abs(dx).toFixed(0)} / {distanceThreshold.toFixed(0)}{" "}
        {distanceCommit ? "✓" : ""}
      </div>
      <div
        style={{
          color: wouldCommit ? "#10b981" : "#ef4444",
          fontWeight: 700,
        }}
      >
        {wouldCommit ? "✓ COMMIT" : "✗ no"}
      </div>
      <div style={{ opacity: 0.5, fontSize: 9 }}>
        {IS_TOUCH ? "touch" : "mouse"}
      </div>
    </div>
  );
}


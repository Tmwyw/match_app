import { useCallback, useEffect, useState } from "react";
import type {
  DiscoverResponse,
  PublicCard,
  SwipeAction,
  SwipeResponse,
} from "@tg-app-meet/shared";
import { api, ApiError } from "../api";

type DeckState =
  | { status: "loading" }
  | { status: "needs-profile" }
  | { status: "empty" }
  | { status: "ready"; card: PublicCard; remaining: number }
  | { status: "error"; error: string };

export function Deck({ onMatched }: { onMatched: (matchId: string) => void }) {
  const [state, setState] = useState<DeckState>({ status: "loading" });
  const [submitting, setSubmitting] = useState<SwipeAction | null>(null);
  const [overlay, setOverlay] = useState<SwipeResponse | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await api<DiscoverResponse>("/discover");
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const swipe = async (action: SwipeAction) => {
    if (state.status !== "ready" || submitting) return;
    setSubmitting(action);
    try {
      const r = await api<SwipeResponse>("/swipes", {
        method: "POST",
        body: JSON.stringify({ toUserId: state.card.userId, action }),
      });
      if (r.matched) setOverlay(r);
      await load();
    } catch (e) {
      setState({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(null);
    }
  };

  if (state.status === "loading") {
    return <Centered text="ищем кандидата…" />;
  }
  if (state.status === "needs-profile") {
    return <Centered text="Сначала заполни профиль." />;
  }
  if (state.status === "error") {
    return (
      <Centered>
        <p className="text-red-500 text-sm">{state.error}</p>
        <button
          onClick={load}
          className="mt-2 rounded-lg border border-tg-hint/30 px-3 py-1 text-sm"
        >
          retry
        </button>
      </Centered>
    );
  }
  if (state.status === "empty") {
    return (
      <Centered>
        <p className="text-tg-hint text-sm">Пока больше никого. Загляни позже.</p>
        <button
          onClick={load}
          className="mt-2 rounded-lg border border-tg-hint/30 px-3 py-1 text-sm"
        >
          обновить
        </button>
      </Centered>
    );
  }

  return (
    <main className="p-4 max-w-md mx-auto flex flex-col gap-4 min-h-full">
      <p className="text-tg-hint text-xs text-right">
        ещё ~{state.remaining} в очереди
      </p>
      <CardView card={state.card} />
      <div className="flex gap-3 mt-auto pb-4">
        <button
          onClick={() => swipe("SKIP")}
          disabled={submitting !== null}
          className="flex-1 rounded-xl border border-tg-hint/30 bg-tg-secondary-bg py-3 text-base font-medium disabled:opacity-50"
        >
          {submitting === "SKIP" ? "…" : "❌ Skip"}
        </button>
        <button
          onClick={() => swipe("LIKE")}
          disabled={submitting !== null}
          className="flex-1 rounded-xl bg-tg-button text-tg-button-text py-3 text-base font-medium disabled:opacity-50"
        >
          {submitting === "LIKE" ? "…" : "❤️ Like"}
        </button>
      </div>

      {overlay && (
        <MatchOverlay
          response={overlay}
          onClose={() => setOverlay(null)}
          onChat={() => {
            const matchId = overlay.matchId;
            setOverlay(null);
            if (matchId) onMatched(matchId);
          }}
        />
      )}
    </main>
  );
}

function CardView({ card }: { card: PublicCard }) {
  return (
    <article className="rounded-2xl border border-tg-hint/30 bg-tg-secondary-bg p-5 flex flex-col gap-3">
      <header>
        <div className="text-xs text-tg-hint">
          {card.role === "BUYER" ? "БАЕР" : "ОВНЕР"}
        </div>
        <h2 className="text-2xl font-semibold">{card.anonId}</h2>
      </header>
      {card.role === "BUYER" ? (
        <BuyerBody card={card} />
      ) : (
        <OwnerBody card={card} />
      )}
    </article>
  );
}

function BuyerBody({ card }: { card: Extract<PublicCard, { role: "BUYER" }> }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <Row label="Вертикали" value={card.verticals.join(", ")} />
      <Row label="Гео" value={card.geos.join(", ")} />
      <Row label="Бюджет" value={`$${card.budgetMin}–${card.budgetMax}`} />
      <Row label="Опыт" value={`${card.experience} лет`} />
      {card.bio && <Row label="О себе" value={card.bio} />}
    </div>
  );
}

function OwnerBody({ card }: { card: Extract<PublicCard, { role: "OWNER" }> }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <Row label="Оффер" value={card.offerName} />
      <Row label="Вертикаль" value={card.vertical} />
      <Row label="Гео" value={card.geos.join(", ")} />
      <Row label="Выплаты" value={`${card.payoutType} · $${card.payoutAmount}`} />
      {card.requirements && <Row label="Требования" value={card.requirements} />}
      {card.bio && <Row label="О себе" value={card.bio} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-tg-hint text-xs">{label}</div>
      <div className="break-words">{value}</div>
    </div>
  );
}

function MatchOverlay({
  response,
  onClose,
  onChat,
}: {
  response: SwipeResponse;
  onClose: () => void;
  onChat: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6">
      <div className="rounded-2xl bg-tg-bg p-6 max-w-sm w-full text-center flex flex-col gap-4">
        <div className="text-4xl">🔥</div>
        <h2 className="text-2xl font-semibold">It's a match!</h2>
        <p className="text-tg-hint text-sm">
          Вы оба лайкнули друг друга. Дальше — анонимный чат.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onChat}
            disabled={!response.matchId}
            className="rounded-lg bg-tg-button text-tg-button-text py-2 font-medium disabled:opacity-50"
          >
            Перейти в чат
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-tg-hint/30 py-2 text-sm"
          >
            Продолжить искать
          </button>
        </div>
      </div>
    </div>
  );
}

function Centered({
  text,
  children,
}: {
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="min-h-full flex flex-col items-center justify-center gap-2 p-6 text-center">
      {text && <p className="text-tg-hint text-sm">{text}</p>}
      {children}
    </main>
  );
}

import { Heart, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
  DiscoverResponse,
  PublicCard,
  Role,
  SwipeAction,
  SwipeResponse,
} from "@tg-app-meet/shared";
import { api, ApiError } from "../api";
import {
  BigActionButton,
  Button,
  Card,
  CenteredMessage,
  MatchOverlay,
  RoleAvatar,
  Screen,
} from "../ui";

type DeckState =
  | { status: "loading" }
  | { status: "needs-profile" }
  | { status: "empty" }
  | { status: "ready"; card: PublicCard; remaining: number }
  | { status: "error"; error: string };

export function Deck({
  myRole,
  onMatched,
}: {
  myRole: Role;
  onMatched: (matchId: string) => void;
}) {
  const [state, setState] = useState<DeckState>({ status: "loading" });
  const [submitting, setSubmitting] = useState<SwipeAction | null>(null);
  const [overlay, setOverlay] = useState<{ response: SwipeResponse; otherRole: Role; otherAnonId: string } | null>(null);

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
    const card = state.card;
    setSubmitting(action);
    try {
      const r = await api<SwipeResponse>("/swipes", {
        method: "POST",
        body: JSON.stringify({ toUserId: card.userId, action }),
      });
      if (r.matched) {
        setOverlay({ response: r, otherRole: card.role, otherAnonId: card.anonId });
      }
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
      <CenteredMessage>
        <p className="text-tg-hint text-sm">
          Пока больше никого. Загляни позже.
        </p>
        <Button variant="secondary" size="md" onClick={load} className="mt-2">
          обновить
        </Button>
      </CenteredMessage>
    );
  }

  return (
    <Screen className="flex flex-col gap-4 min-h-screen">
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col gap-5">
        <p className="text-tg-hint text-xs text-right">
          ещё ~{state.remaining} в очереди
        </p>
        <CardView card={state.card} />
        <div className="flex items-center justify-center gap-8 pt-2">
          <BigActionButton
            variant="danger"
            ariaLabel="Skip"
            disabled={submitting !== null}
            onClick={() => swipe("SKIP")}
            icon={<X size={28} strokeWidth={2.5} />}
          />
          <BigActionButton
            variant="info"
            ariaLabel="Like"
            disabled={submitting !== null}
            onClick={() => swipe("LIKE")}
            icon={<Heart size={28} fill="currentColor" />}
          />
        </div>
      </div>

      {overlay && (
        <MatchOverlay
          myRole={myRole}
          otherRole={overlay.otherRole}
          otherAnonId={overlay.otherAnonId}
          onChat={() => {
            const matchId = overlay.response.matchId;
            setOverlay(null);
            if (matchId) onMatched(matchId);
          }}
          onContinue={() => setOverlay(null)}
        />
      )}
    </Screen>
  );
}

function CardView({ card }: { card: PublicCard }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-center gap-3">
        <RoleAvatar role={card.role} size="lg" />
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-tg-hint">
            {card.role === "BUYER" ? "БАЕР" : "ОВНЕР"}
          </div>
          <h2 className="text-2xl font-bold">{card.anonId}</h2>
        </div>
      </header>
      {card.role === "BUYER" ? (
        <BuyerBody card={card} />
      ) : (
        <OwnerBody card={card} />
      )}
    </Card>
  );
}

function BuyerBody({
  card,
}: {
  card: Extract<PublicCard, { role: "BUYER" }>;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <Row label="Источники" value={card.verticals.join(" · ")} />
      <Row label="Гео" value={card.geos.join(" · ")} />
      <Row label="Бюджет" value={`$${card.budgetMin}–${card.budgetMax}`} />
      <Row label="Опыт" value={`${card.experience} лет`} />
      {card.bio && <Row label="О себе" value={card.bio} />}
    </div>
  );
}

function OwnerBody({
  card,
}: {
  card: Extract<PublicCard, { role: "OWNER" }>;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <Row label="Оффер" value={card.offerName} />
      <Row label="Вертикаль" value={card.vertical} />
      <Row label="Гео" value={card.geos.join(" · ")} />
      <Row
        label="Выплаты"
        value={`${card.payoutType} · $${card.payoutAmount}`}
      />
      {card.requirements && <Row label="Требования" value={card.requirements} />}
      {card.bio && <Row label="О себе" value={card.bio} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-tg-hint">
        {label}
      </div>
      <div className="break-words mt-0.5">{value}</div>
    </div>
  );
}

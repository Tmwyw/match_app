import { useCallback, useEffect, useState } from "react";
import type { MatchesListResponse, PublicCard } from "@tg-app-meet/shared";
import { api } from "../api";

type State =
  | { status: "loading" }
  | { status: "ready"; data: MatchesListResponse }
  | { status: "error"; error: string };

export function MatchesList({
  onOpenChat,
}: {
  onOpenChat: (matchId: string, chatId: string) => void;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await api<MatchesListResponse>("/matches");
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

  if (state.status === "loading") {
    return <Centered text="загружаем матчи…" />;
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
  if (state.data.length === 0) {
    return <Centered text="Пока матчей нет. Лайкай кандидатов во вкладке «Найти»." />;
  }
  return (
    <main className="p-4 max-w-md mx-auto flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Мои матчи</h1>
      <ul className="flex flex-col gap-2">
        {state.data.map((m) => (
          <li key={m.matchId}>
            <button
              onClick={() => onOpenChat(m.matchId, m.chatId)}
              className="w-full rounded-xl border border-tg-hint/30 bg-tg-secondary-bg p-4 text-left"
            >
              <div className="text-xs text-tg-hint">
                {m.other.role === "BUYER" ? "БАЕР" : "ОВНЕР"} ·{" "}
                {new Date(m.createdAt).toLocaleDateString()}
              </div>
              <div className="font-semibold">{m.other.anonId}</div>
              <div className="text-sm text-tg-hint mt-1">{summarize(m.other)}</div>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

function summarize(card: PublicCard): string {
  if (card.role === "BUYER") {
    return `${card.verticals.join("/")} · ${card.geos.join(",")} · $${card.budgetMin}–${card.budgetMax}`;
  }
  return `${card.offerName} · ${card.vertical} · ${card.payoutType} $${card.payoutAmount}`;
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

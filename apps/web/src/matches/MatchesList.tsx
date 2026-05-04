import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { MatchesListResponse, PublicCard } from "@tg-app-meet/shared";
import { api } from "../api";
import { Button, Card, CenteredMessage, RoleAvatar, Screen } from "../ui";

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
    return (
      <CenteredMessage>
        <p className="text-tg-hint text-sm">загружаем матчи…</p>
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
  if (state.data.length === 0) {
    return (
      <CenteredMessage>
        <p className="text-tg-hint text-sm">
          Пока матчей нет. Лайкай кандидатов во вкладке «Найти».
        </p>
      </CenteredMessage>
    );
  }
  return (
    <Screen className="min-h-screen">
      <div className="max-w-md mx-auto flex flex-col gap-3">
        <h1 className="text-2xl font-bold mt-2 mb-1">Мои матчи</h1>
        <ul className="flex flex-col gap-2">
          {state.data.map((m) => (
            <li key={m.matchId}>
              <Card
                onClick={() => onOpenChat(m.matchId, m.chatId)}
                className="flex items-center gap-3"
              >
                <RoleAvatar role={m.other.role} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{m.other.anonId}</div>
                  <div className="text-xs text-tg-hint truncate">
                    {summarize(m.other)}
                  </div>
                </div>
                <ChevronRight size={20} className="text-tg-hint shrink-0" />
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </Screen>
  );
}

function summarize(card: PublicCard): string {
  if (card.role === "BUYER") {
    return `${card.verticals.join("/")} · ${card.geos.join(",")} · $${card.budgetMin}–${card.budgetMax}`;
  }
  return `${card.offerName} · ${card.vertical} · ${card.payoutType} $${card.payoutAmount}`;
}

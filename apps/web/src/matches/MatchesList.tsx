import { Archive, ArchiveRestore, ChevronRight, Heart } from "lucide-react";
import { type MouseEvent, useCallback, useEffect, useState } from "react";
import type { MatchesListResponse, PublicCard } from "@tg-app-meet/shared";
import { api } from "../api";
import type { OpenChat } from "../App";
import { Button, Card, CenteredMessage, Logo, RoleAvatar, Screen, cn } from "../ui";

type Tab = "active" | "archived";
type State =
  | { status: "loading" }
  | { status: "ready"; data: MatchesListResponse }
  | { status: "error"; error: string };

export function MatchesList({
  onOpenChat,
  inboundLikesCount,
}: {
  onOpenChat: (payload: OpenChat) => void;
  /** Comes from the parent's polling hook so the banner stays in sync
   *  with the tab badge. 0 → banner hidden. */
  inboundLikesCount: number;
}) {
  const [tab, setTab] = useState<Tab>("active");
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await api<MatchesListResponse>(
        `/matches?archived=${tab === "archived"}`,
      );
      setState({ status: "ready", data });
    } catch (e) {
      setState({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  // Toggle a single row's archived state without refetching first — the
  // optimistic remove is enough; load() reconciles with server truth.
  const toggleArchive = async (matchId: string, archived: boolean) => {
    setState((s) =>
      s.status === "ready"
        ? { ...s, data: s.data.filter((m) => m.matchId !== matchId) }
        : s,
    );
    try {
      await api(`/matches/${matchId}/archive`, {
        method: archived ? "POST" : "DELETE",
      });
    } finally {
      // Re-fetch in the background so we recover from any optimistic miss.
      void load();
    }
  };

  return (
    <Screen className="min-h-screen">
      <div className="max-w-md mx-auto flex flex-col gap-3">
        <div className="flex justify-center pt-2">
          <Logo size={84} />
        </div>
        <h1 className="text-2xl font-bold mt-1 mb-1">Мои матчи</h1>

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

        <div className="flex gap-1 p-1 rounded-button bg-card border border-app-border self-start">
          <TabBtn active={tab === "active"} onClick={() => setTab("active")}>
            Активные
          </TabBtn>
          <TabBtn active={tab === "archived"} onClick={() => setTab("archived")}>
            Архив
          </TabBtn>
        </div>

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
            {tab === "active"
              ? "Пока матчей нет. Лайкай кандидатов во вкладке «Найти»."
              : "Архив пуст."}
          </p>
        )}
        {state.status === "ready" && state.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {state.data.map((m) => (
              <li key={m.matchId}>
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
                    <div className="font-semibold truncate">{m.other.displayName ?? m.other.anonId}</div>
                    <div className="text-xs text-tg-hint truncate">
                      {summarize(m.other)}
                    </div>
                  </div>
                  <ArchiveBtn
                    archived={tab === "archived"}
                    onClick={(e) => {
                      // stopPropagation so tapping the icon doesn't open the chat.
                      e.stopPropagation();
                      void toggleArchive(m.matchId, tab !== "archived");
                    }}
                  />
                  <ChevronRight size={20} className="text-tg-hint shrink-0" />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Screen>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-sm font-medium rounded-button transition",
        active
          ? "bg-accent text-accent-text"
          : "text-tg-hint active:text-tg-text",
      )}
    >
      {children}
    </button>
  );
}

function ArchiveBtn({
  archived,
  onClick,
}: {
  archived: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={archived ? "разархивировать" : "архивировать"}
      className="p-2 -mx-1 text-tg-hint active:text-tg-text rounded-full"
    >
      {archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
    </button>
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

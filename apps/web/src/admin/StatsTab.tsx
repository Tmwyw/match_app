import { useCallback, useEffect, useState } from "react";
import type { AdminStats } from "@tg-app-meet/shared";
import { adminApi } from "./admin-api";
import { styles } from "./admin-styles";

type State =
  | { status: "loading" }
  | { status: "ready"; stats: AdminStats }
  | { status: "error"; error: string };

export function StatsTab({ token }: { token: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const stats = await adminApi.stats(token);
      setState({ status: "ready", stats });
    } catch (e) {
      setState({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") return <p>loading…</p>;
  if (state.status === "error") {
    return <p style={styles.error}>error: {state.error}</p>;
  }

  const s = state.stats;
  return (
    <>
      <div style={styles.toolbar}>
        <button style={styles.btn} onClick={load}>
          refresh
        </button>
      </div>

      <Section title="users">
        <Stat label="total" value={s.users.total} />
        <Stat label="online now" value={s.users.onlineNow} />
        <Stat label="with role" value={s.users.withRole} />
        <Stat label="buyers" value={s.users.buyers} />
        <Stat label="owners" value={s.users.owners} />
        <Stat label="banned" value={s.users.banned} />
        <Stat label="deleted" value={s.users.deleted} />
        <Stat label="new (24h)" value={s.users.new24h} hint="last 24 hours" />
        <Stat label="new (7d)" value={s.users.new7d} hint="last 7 days" />
      </Section>

      <Section title="matches">
        <Stat label="total" value={s.matches.total} />
        <Stat label="new (24h)" value={s.matches.last24h} />
        <Stat label="new (7d)" value={s.matches.last7d} />
      </Section>

      <Section title="messages">
        <Stat label="total" value={s.messages.total} />
        <Stat label="new (24h)" value={s.messages.last24h} />
      </Section>

      <Section title="reports">
        <Stat label="open" value={s.reports.open} />
        <Stat label="resolved" value={s.reports.resolved} />
        <Stat label="new (7d)" value={s.reports.last7d} />
      </Section>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <h3 style={{ margin: "16px 0 8px", fontSize: 12, opacity: 0.7 }}>
        {title.toUpperCase()}
      </h3>
      <div style={styles.statGrid}>{children}</div>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value.toLocaleString("ru-RU")}</div>
      {hint && <div style={styles.statHint}>{hint}</div>}
    </div>
  );
}

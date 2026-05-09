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

  if (state.status === "loading") return <p>загружаем…</p>;
  if (state.status === "error") {
    return <p style={styles.error}>ошибка: {state.error}</p>;
  }

  const s = state.stats;
  return (
    <>
      <div style={styles.toolbar}>
        <button style={styles.btn} onClick={load}>
          обновить
        </button>
      </div>

      <Section title="Пользователи">
        <Stat label="всего" value={s.users.total} />
        <Stat label="онлайн сейчас" value={s.users.onlineNow} />
        <Stat label="с ролью" value={s.users.withRole} />
        <Stat label="баеры" value={s.users.buyers} />
        <Stat label="овнеры" value={s.users.owners} />
        <Stat label="забанены" value={s.users.banned} />
        <Stat label="удалены" value={s.users.deleted} />
        <Stat label="новых (24ч)" value={s.users.new24h} hint="за последние 24 часа" />
        <Stat label="новых (7д)" value={s.users.new7d} hint="за последние 7 дней" />
      </Section>

      <Section title="Матчи">
        <Stat label="всего" value={s.matches.total} />
        <Stat label="новых (24ч)" value={s.matches.last24h} />
        <Stat label="новых (7д)" value={s.matches.last7d} />
      </Section>

      <Section title="Сообщения">
        <Stat label="всего" value={s.messages.total} />
        <Stat label="новых (24ч)" value={s.messages.last24h} />
      </Section>

      <Section title="Жалобы">
        <Stat label="открытых" value={s.reports.open} />
        <Stat label="решено" value={s.reports.resolved} />
        <Stat label="новых (7д)" value={s.reports.last7d} />
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

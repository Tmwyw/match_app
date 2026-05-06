import { useCallback, useEffect, useState } from "react";
import type { AdminUserSummary, AdminUsersResponse } from "@tg-app-meet/shared";
import { adminApi } from "./admin-api";
import { pillFor, styles } from "./admin-styles";

const PAGE = 50;

type State =
  | { status: "loading" }
  | { status: "ready"; data: AdminUsersResponse }
  | { status: "error"; error: string };

export function UsersTab({
  token,
  onOpenUser,
}: {
  token: string;
  onOpenUser: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("any");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [skip, setSkip] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await adminApi.listUsers(token, {
        q: q.trim() || undefined,
        status: statusFilter,
        role: roleFilter || undefined,
        take: PAGE,
        skip,
      });
      setState({ status: "ready", data });
    } catch (e) {
      setState({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [token, q, statusFilter, roleFilter, skip]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSkip(0);
    void load();
  };

  return (
    <>
      <form style={styles.toolbar} onSubmit={submit}>
        <input
          style={{ ...styles.input, flex: 1 }}
          placeholder="search anonId / username / id / telegramId"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          style={styles.select}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setSkip(0);
          }}
        >
          <option value="any">any status</option>
          <option value="active">active</option>
          <option value="banned">banned</option>
          <option value="deleted">deleted</option>
        </select>
        <select
          style={styles.select}
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setSkip(0);
          }}
        >
          <option value="">any role</option>
          <option value="BUYER">buyers</option>
          <option value="OWNER">owners</option>
        </select>
        <button style={styles.btn} type="submit">
          search
        </button>
      </form>

      {state.status === "loading" && <p>loading…</p>}
      {state.status === "error" && (
        <p style={styles.error}>error: {state.error}</p>
      )}
      {state.status === "ready" && (
        <>
          <div style={{ fontSize: 12, marginBottom: 8, opacity: 0.7 }}>
            {state.data.total} total ·{" "}
            {state.data.rows.length === 0
              ? "no rows"
              : `showing ${skip + 1}–${skip + state.data.rows.length}`}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>anon</th>
                  <th style={styles.th}>role</th>
                  <th style={styles.th}>username</th>
                  <th style={styles.th}>created</th>
                  <th style={styles.th}>last seen</th>
                  <th style={styles.th}>matches</th>
                  <th style={styles.th}>msgs</th>
                  <th style={styles.th}>reports</th>
                  <th style={styles.th}>state</th>
                </tr>
              </thead>
              <tbody>
                {state.data.rows.map((u) => (
                  <UserRow key={u.id} u={u} onOpen={() => onOpenUser(u.id)} />
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ ...styles.toolbar, marginTop: 12 }}>
            <button
              style={styles.btn}
              disabled={skip === 0}
              onClick={() => setSkip(Math.max(0, skip - PAGE))}
            >
              ← prev
            </button>
            <button
              style={styles.btn}
              disabled={skip + state.data.rows.length >= state.data.total}
              onClick={() => setSkip(skip + PAGE)}
            >
              next →
            </button>
            <button style={styles.btn} onClick={load}>
              refresh
            </button>
          </div>
        </>
      )}
    </>
  );
}

function UserRow({
  u,
  onOpen,
}: {
  u: AdminUserSummary;
  onOpen: () => void;
}) {
  return (
    <tr style={{ cursor: "pointer" }} onClick={onOpen}>
      <td style={styles.td}>
        <b>{u.anonId ?? "—"}</b>
      </td>
      <td style={styles.td}>{u.role ?? "—"}</td>
      <td style={styles.td}>{u.username ? `@${u.username}` : "—"}</td>
      <td style={styles.td}>{shortDate(u.createdAt)}</td>
      <td style={styles.td}>{shortDate(u.lastSeenAt)}</td>
      <td style={styles.td}>{u.counts.matches}</td>
      <td style={styles.td}>{u.counts.messages}</td>
      <td style={styles.td}>{u.counts.reportsAgainst}</td>
      <td style={styles.td}>{pillFor(u)}</td>
    </tr>
  );
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

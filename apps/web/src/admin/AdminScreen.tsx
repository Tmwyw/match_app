import { useCallback, useEffect, useState } from "react";
import type {
  AdminReport,
  AdminReportsResponse,
  ReportResolution,
} from "@tg-app-meet/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

type State =
  | { status: "loading" }
  | { status: "ready"; reports: AdminReportsResponse }
  | { status: "error"; error: string };

/**
 * Bare-bones admin console — opened via /?admin=<token>. Token is sent as
 * Bearer on every /admin/* call. Intentionally not styled to match the
 * Mini App; it's an operator tool, not user-facing.
 */
export function AdminScreen({ token }: { token: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch(`${API_BASE}/admin/reports?resolved=false`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      const reports = (await res.json()) as AdminReportsResponse;
      setState({ status: "ready", reports });
    } catch (e) {
      setState({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [token]);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  const resolve = async (id: string, resolution: ReportResolution) => {
    setBusy(id);
    try {
      const res = await fetch(`${API_BASE}/admin/reports/${id}/resolve`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ resolution }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      await fetchReports();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Reports — admin</h1>
        <button style={styles.btn} onClick={fetchReports}>
          refresh
        </button>
      </header>

      {state.status === "loading" && <p>loading…</p>}
      {state.status === "error" && (
        <p style={styles.error}>error: {state.error}</p>
      )}
      {state.status === "ready" && state.reports.length === 0 && (
        <p>no open reports.</p>
      )}
      {state.status === "ready" &&
        state.reports.map((r) => (
          <ReportRow
            key={r.id}
            report={r}
            busy={busy === r.id}
            onResolve={(res) => resolve(r.id, res)}
          />
        ))}
    </div>
  );
}

function ReportRow({
  report: r,
  busy,
  onResolve,
}: {
  report: AdminReport;
  busy: boolean;
  onResolve: (resolution: ReportResolution) => void;
}) {
  return (
    <div style={styles.row}>
      <div style={styles.meta}>
        <code>{r.id}</code> · {new Date(r.createdAt).toLocaleString()}
        {r.targetBannedAt && (
          <span style={styles.banPill}>BANNED {new Date(r.targetBannedAt).toLocaleDateString()}</span>
        )}
      </div>
      <div style={styles.meta}>
        <b>reason:</b> {r.reason}
      </div>
      <div style={styles.meta}>
        <b>reporter:</b> {r.reporterAnonId ?? "?"} (<code>{r.reporterId}</code>)
      </div>
      <div style={styles.meta}>
        <b>target:</b> {r.targetAnonId ?? "?"} (<code>{r.targetUserId}</code>)
        {r.targetUsername && <> · @{r.targetUsername}</>}
      </div>
      {r.chatId && (
        <div style={styles.meta}>
          <b>chat:</b> <code>{r.chatId}</code>
        </div>
      )}
      {r.details && (
        <pre style={styles.details}>{r.details}</pre>
      )}
      <div style={styles.actions}>
        <button
          style={{ ...styles.btn, ...styles.noAction }}
          disabled={busy}
          onClick={() => onResolve("no_action")}
        >
          no action
        </button>
        <button
          style={{ ...styles.btn, ...styles.warned }}
          disabled={busy}
          onClick={() => onResolve("warned")}
        >
          warned
        </button>
        <button
          style={{ ...styles.btn, ...styles.banned }}
          disabled={busy}
          onClick={() => onResolve("banned")}
        >
          ban
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    padding: 16,
    maxWidth: 900,
    margin: "0 auto",
    color: "#e5e7eb",
    background: "#0f1419",
    minHeight: "100vh",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: { margin: 0, fontSize: 18 },
  row: {
    border: "1px solid #2a3441",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    background: "#1b232e",
  },
  meta: { fontSize: 12, marginBottom: 4 },
  details: {
    background: "#0f1419",
    border: "1px solid #2a3441",
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    whiteSpace: "pre-wrap",
    margin: "8px 0",
  },
  actions: { display: "flex", gap: 6, marginTop: 8 },
  btn: {
    padding: "6px 10px",
    border: "1px solid #2a3441",
    borderRadius: 6,
    background: "#232c39",
    color: "#e5e7eb",
    fontSize: 12,
    cursor: "pointer",
  },
  noAction: { background: "#2a3441" },
  warned: { background: "#7c5e00", borderColor: "#7c5e00" },
  banned: { background: "#7f1d1d", borderColor: "#7f1d1d" },
  banPill: {
    background: "#7f1d1d",
    color: "white",
    padding: "1px 6px",
    borderRadius: 4,
    marginLeft: 8,
    fontSize: 10,
  },
  error: { color: "#f87171" },
};

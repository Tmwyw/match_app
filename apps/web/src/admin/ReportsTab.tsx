import { useCallback, useEffect, useState } from "react";
import type {
  AdminReport,
  AdminReportsResponse,
  ReportResolution,
} from "@tg-app-meet/shared";
import { adminApi } from "./admin-api";
import { styles } from "./admin-styles";

type State =
  | { status: "loading" }
  | { status: "ready"; reports: AdminReportsResponse }
  | { status: "error"; error: string };

export function ReportsTab({
  token,
  onOpenUser,
  onOpenChat,
}: {
  token: string;
  onOpenUser: (id: string) => void;
  onOpenChat: (id: string) => void;
}) {
  const [includeResolved, setIncludeResolved] = useState(false);
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const reports = await adminApi.reports(token, includeResolved);
      setState({ status: "ready", reports });
    } catch (e) {
      setState({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [token, includeResolved]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (id: string, resolution: ReportResolution) => {
    setBusy(id);
    try {
      await adminApi.resolveReport(token, id, { resolution });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div style={styles.toolbar}>
        <label
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
        >
          <input
            type="checkbox"
            checked={includeResolved}
            onChange={(e) => setIncludeResolved(e.target.checked)}
          />
          show resolved
        </label>
        <button style={styles.btn} onClick={load}>
          refresh
        </button>
      </div>

      {state.status === "loading" && <p>loading…</p>}
      {state.status === "error" && (
        <p style={styles.error}>error: {state.error}</p>
      )}
      {state.status === "ready" && state.reports.length === 0 && (
        <p style={{ opacity: 0.6 }}>no reports.</p>
      )}
      {state.status === "ready" &&
        state.reports.map((r) => (
          <ReportRow
            key={r.id}
            report={r}
            busy={busy === r.id}
            onResolve={(res) => resolve(r.id, res)}
            onOpenUser={onOpenUser}
            onOpenChat={onOpenChat}
          />
        ))}
    </>
  );
}

function ReportRow({
  report: r,
  busy,
  onResolve,
  onOpenUser,
  onOpenChat,
}: {
  report: AdminReport;
  busy: boolean;
  onResolve: (resolution: ReportResolution) => void;
  onOpenUser: (id: string) => void;
  onOpenChat: (id: string) => void;
}) {
  return (
    <div style={styles.row}>
      <div style={styles.meta}>
        <code>{r.id}</code> · {new Date(r.createdAt).toLocaleString("ru-RU")}
        {r.targetBannedAt && (
          <span style={{ ...styles.pill, ...styles.pillBan }}>banned</span>
        )}
        {r.resolvedAt && (
          <span style={{ ...styles.pill, ...styles.pillRole }}>
            {r.resolution ?? "resolved"}
          </span>
        )}
      </div>
      <div style={styles.meta}>
        <b>reason:</b> {r.reason}
      </div>
      <div style={styles.meta}>
        <b>reporter:</b>{" "}
        <button
          style={{ ...styles.btn, ...styles.btnGhost, padding: "0 2px" }}
          onClick={() => onOpenUser(r.reporterId)}
        >
          {r.reporterAnonId ?? r.reporterId.slice(0, 8)}
        </button>
      </div>
      <div style={styles.meta}>
        <b>target:</b>{" "}
        <button
          style={{ ...styles.btn, ...styles.btnGhost, padding: "0 2px" }}
          onClick={() => onOpenUser(r.targetUserId)}
        >
          {r.targetAnonId ?? r.targetUserId.slice(0, 8)}
        </button>
        {r.targetUsername && <> · @{r.targetUsername}</>}
      </div>
      {r.chatId && (
        <div style={styles.meta}>
          <b>chat:</b>{" "}
          <button
            style={{ ...styles.btn, ...styles.btnGhost, padding: "0 2px" }}
            onClick={() => onOpenChat(r.chatId!)}
          >
            <code>{r.chatId.slice(0, 12)}</code> — open transcript
          </button>
        </div>
      )}
      {r.details && <pre style={styles.details}>{r.details}</pre>}
      {!r.resolvedAt && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button
            style={styles.btn}
            disabled={busy}
            onClick={() => onResolve("no_action")}
          >
            no action
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnWarn }}
            disabled={busy}
            onClick={() => onResolve("warned")}
          >
            warned
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnDanger }}
            disabled={busy}
            onClick={() => onResolve("banned")}
          >
            ban
          </button>
        </div>
      )}
    </div>
  );
}

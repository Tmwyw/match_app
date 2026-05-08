import { useCallback, useEffect, useState } from "react";
import type { AdminUserDetail } from "@tg-app-meet/shared";
import { adminApi } from "./admin-api";
import { palette, pillFor, styles } from "./admin-styles";

type State =
  | { status: "loading" }
  | { status: "ready"; user: AdminUserDetail }
  | { status: "error"; error: string };

export function UserDetailPanel({
  token,
  userId,
  onClose,
  onOpenChat,
  onOpenUser,
}: {
  token: string;
  userId: string;
  onClose: () => void;
  onOpenChat: (chatId: string) => void;
  onOpenUser: (id: string) => void;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const user = await adminApi.userDetail(token, userId);
      setState({ status: "ready", user });
    } catch (e) {
      setState({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [token, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ban = async () => {
    const reason = window.prompt("Ban reason (shown nowhere user-facing):");
    if (!reason || !reason.trim()) return;
    setBusy("ban");
    try {
      const user = await adminApi.banUser(token, userId, { reason: reason.trim() });
      setState({ status: "ready", user });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const unban = async () => {
    if (!confirm("Unban this user?")) return;
    setBusy("unban");
    try {
      const user = await adminApi.unbanUser(token, userId);
      setState({ status: "ready", user });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const resetRole = async () => {
    if (
      !confirm(
        "Reset this user's role + clear their profile?\n\nThey'll go through onboarding again. Existing matches and chats stay intact (their anonId will change for the new role).",
      )
    ) {
      return;
    }
    setBusy("reset-role");
    try {
      const user = await adminApi.resetUserRole(token, userId);
      setState({ status: "ready", user });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...styles.toolbar, justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>User</h2>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={styles.btn} onClick={load}>
              refresh
            </button>
            <button style={styles.btn} onClick={onClose}>
              close
            </button>
          </div>
        </div>

        {state.status === "loading" && <p>loading…</p>}
        {state.status === "error" && (
          <p style={styles.error}>error: {state.error}</p>
        )}
        {state.status === "ready" && (
          <UserBody
            user={state.user}
            busy={busy}
            onBan={ban}
            onUnban={unban}
            onResetRole={resetRole}
            onOpenChat={onOpenChat}
            onOpenUser={onOpenUser}
          />
        )}
      </div>
    </div>
  );
}

function UserBody({
  user,
  busy,
  onBan,
  onUnban,
  onResetRole,
  onOpenChat,
  onOpenUser,
}: {
  user: AdminUserDetail;
  busy: string | null;
  onBan: () => void;
  onUnban: () => void;
  onResetRole: () => void;
  onOpenChat: (id: string) => void;
  onOpenUser: (id: string) => void;
}) {
  return (
    <>
      <div style={styles.card}>
        <div style={{ ...styles.meta, fontSize: 14, marginBottom: 8 }}>
          <b>{user.anonId ?? "(no role yet)"}</b>{" "}
          <span style={{ ...styles.pill, ...styles.pillRole }}>
            {user.role ?? "—"}
          </span>
          {pillFor(user)}
        </div>
        <Field label="id">
          <code>{user.id}</code>
        </Field>
        <Field label="telegramId">
          <code>{user.telegramId}</code>
        </Field>
        <Field label="username">
          {user.username ? `@${user.username}` : "—"}
        </Field>
        <Field label="created">{fmt(user.createdAt)}</Field>
        <Field label="last seen">{fmt(user.lastSeenAt)}</Field>
        {user.bannedAt && (
          <Field label="banned at">
            {fmt(user.bannedAt)} — {user.banReason ?? "no reason"}
          </Field>
        )}
        {user.deletedAt && (
          <Field label="deleted at">{fmt(user.deletedAt)}</Field>
        )}
        <Field label="counts">
          M:{user.counts.matches} · Msg:{user.counts.messages} · R:
          {user.counts.reportsAgainst} · B:{user.counts.blocksAgainst}
        </Field>
        <div style={{ ...styles.toolbar, marginTop: 8, marginBottom: 0 }}>
          {user.bannedAt ? (
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              disabled={!!busy}
              onClick={onUnban}
            >
              {busy === "unban" ? "..." : "unban"}
            </button>
          ) : (
            <button
              style={{ ...styles.btn, ...styles.btnDanger }}
              disabled={!!busy || !!user.deletedAt}
              onClick={onBan}
            >
              {busy === "ban" ? "..." : "ban"}
            </button>
          )}
          <button
            style={{ ...styles.btn, ...styles.btnWarn }}
            disabled={!!busy}
            onClick={onResetRole}
          >
            {busy === "reset-role" ? "..." : "reset role + clear profile"}
          </button>
        </div>
      </div>

      {user.buyerProfile && (
        <Card title="Buyer profile">
          <Field label="verticals">
            {user.buyerProfile.verticals.join(", ") || "—"}
          </Field>
          <Field label="geos">
            {user.buyerProfile.geos.join(", ") || "—"}
          </Field>
          <Field label="budget">
            {user.buyerProfile.budgetMin}–{user.buyerProfile.budgetMax}
          </Field>
          <Field label="experience">{user.buyerProfile.experience}</Field>
          <Field label="active">{String(user.buyerProfile.isActive)}</Field>
          {user.buyerProfile.bio && (
            <pre style={styles.details}>{user.buyerProfile.bio}</pre>
          )}
        </Card>
      )}

      {user.ownerProfile && (
        <Card title="Owner profile">
          <Field label="offer (нужен)">{user.ownerProfile.offerName}</Field>
          <Field label="traffic">
            {user.ownerProfile.trafficSources.join(", ") || "—"}
          </Field>
          <Field label="verticals">
            {user.ownerProfile.verticals.join(", ") || "—"}
          </Field>
          <Field label="geos">
            {user.ownerProfile.geos.join(", ") || "—"}
          </Field>
          <Field label="payout">
            ${user.ownerProfile.payoutMin}–${user.ownerProfile.payoutMax}
          </Field>
          <Field label="active">{String(user.ownerProfile.isActive)}</Field>
          {user.ownerProfile.requirements && (
            <pre style={styles.details}>{user.ownerProfile.requirements}</pre>
          )}
          {user.ownerProfile.bio && (
            <pre style={styles.details}>{user.ownerProfile.bio}</pre>
          )}
        </Card>
      )}

      {user.recentReportsAgainst.length > 0 && (
        <Card title={`Reports against (${user.recentReportsAgainst.length})`}>
          {user.recentReportsAgainst.map((r) => (
            <div
              key={r.id}
              style={{
                fontSize: 12,
                paddingBottom: 6,
                marginBottom: 6,
                borderBottom: `1px dashed ${palette.border}`,
              }}
            >
              <div>
                <b>{r.reason}</b> · {fmt(r.createdAt)}
                {r.resolution && (
                  <span style={{ marginLeft: 6, color: palette.textDim }}>
                    → {r.resolution}
                  </span>
                )}
              </div>
              <div style={{ color: palette.textDim }}>
                from {r.reporterAnonId ?? "?"}
              </div>
              {r.details && (
                <pre style={{ ...styles.details, margin: "4px 0" }}>
                  {r.details}
                </pre>
              )}
            </div>
          ))}
        </Card>
      )}

      {user.recentChats.length > 0 && (
        <Card title={`Recent chats (${user.recentChats.length})`}>
          {user.recentChats.map((c) => (
            <div
              key={c.chatId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 0",
                borderBottom: `1px dashed ${palette.border}`,
                fontSize: 12,
              }}
            >
              <div>
                with{" "}
                <button
                  style={{ ...styles.btn, ...styles.btnGhost, padding: "0 2px" }}
                  onClick={() => onOpenUser(c.otherUserId)}
                >
                  {c.otherAnonId ?? c.otherUserId.slice(0, 8)}
                </button>{" "}
                · {c.messagesCount} msgs
                {c.lastMessageAt && (
                  <span style={{ color: palette.textDim, marginLeft: 6 }}>
                    last: {fmt(c.lastMessageAt)}
                  </span>
                )}
              </div>
              <button
                style={styles.btn}
                onClick={() => onOpenChat(c.chatId)}
              >
                open chat
              </button>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...styles.card, marginTop: 12 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 12, opacity: 0.7 }}>
        {title.toUpperCase()}
      </h3>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.meta}>
      <span style={styles.label}>{label}:</span> {children}
    </div>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU");
}

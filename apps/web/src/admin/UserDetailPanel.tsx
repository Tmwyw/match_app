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
    const reason = window.prompt(
      "Причина бана (видна только админам):",
    );
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
    if (!confirm("Разбанить этого пользователя?")) return;
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

  const hardDelete = async () => {
    if (
      !confirm(
        "🗑 ПОЛНОЕ УДАЛЕНИЕ\n\n" +
          "Удалить этого пользователя со всеми его данными?\n\n" +
          "Снесётся: анкета, все его матчи, чаты, сообщения, " +
          "свайпы, жалобы, блоки, настройки уведомлений.\n\n" +
          "Восстановить нельзя. При следующем входе через Telegram " +
          "у него создастся новый аккаунт с нуля.",
      )
    ) {
      return;
    }
    setBusy("hard-delete");
    try {
      await adminApi.hardDeleteUser(token, userId);
      // User row is gone — close the panel; the parent's user list
      // will reload itself on next user-card click or refresh.
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...styles.toolbar, justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Пользователь</h2>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={styles.btn} onClick={load}>
              обновить
            </button>
            <button style={styles.btn} onClick={onClose}>
              закрыть
            </button>
          </div>
        </div>

        {state.status === "loading" && <p>загружаем…</p>}
        {state.status === "error" && (
          <p style={styles.error}>ошибка: {state.error}</p>
        )}
        {state.status === "ready" && (
          <UserBody
            user={state.user}
            busy={busy}
            onBan={ban}
            onUnban={unban}
            onHardDelete={hardDelete}
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
  onHardDelete,
  onOpenChat,
  onOpenUser,
}: {
  user: AdminUserDetail;
  busy: string | null;
  onBan: () => void;
  onUnban: () => void;
  onHardDelete: () => void;
  onOpenChat: (id: string) => void;
  onOpenUser: (id: string) => void;
}) {
  return (
    <>
      <div style={styles.card}>
        <div style={{ ...styles.meta, fontSize: 14, marginBottom: 8 }}>
          <b>{user.anonId ?? "(нет роли)"}</b>{" "}
          <span style={{ ...styles.pill, ...styles.pillRole }}>
            {user.role === "BUYER"
              ? "БАЕР"
              : user.role === "OWNER"
                ? "ОВНЕР"
                : "—"}
          </span>
          {pillFor(user)}
        </div>
        <Field label="id">
          <code>{user.id}</code>
        </Field>
        <Field label="telegramId">
          {/* Always clickable — tapping opens the user's profile in the
              operator's TG client, even if there's no @username. */}
          <a
            href={`tg://user?id=${user.telegramId}`}
            style={{ color: "inherit" }}
          >
            <code>{user.telegramId}</code>
          </a>
        </Field>
        <Field label="username">
          {user.username ? (
            <a
              href={`tg://resolve?domain=${user.username}`}
              style={{ color: "inherit" }}
            >
              @{user.username}
            </a>
          ) : (
            // No @handle — the telegramId field above is the way in.
            // Render an explicit "open chat" link here too so operators
            // see the action without having to know about the trick.
            <a
              href={`tg://user?id=${user.telegramId}`}
              style={{ color: "inherit", opacity: 0.7 }}
            >
              нет — открыть чат по telegramId
            </a>
          )}
        </Field>
        <Field label="создан">{fmt(user.createdAt)}</Field>
        <Field label="был онлайн">{fmt(user.lastSeenAt)}</Field>
        {user.bannedAt && (
          <Field label="забанен">
            {fmt(user.bannedAt)} — {user.banReason ?? "без причины"}
          </Field>
        )}
        {user.deletedAt && (
          <Field label="удалён">{fmt(user.deletedAt)}</Field>
        )}
        <Field label="счётчики">
          🤝 матчей: {user.counts.matches} · 💬 сообщений: {user.counts.messages} · 🚨 жалоб:
          {" "}{user.counts.reportsAgainst} · 🚫 блоков: {user.counts.blocksAgainst}
        </Field>
        <div style={{ ...styles.toolbar, marginTop: 8, marginBottom: 0 }}>
          {user.bannedAt ? (
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              disabled={!!busy}
              onClick={onUnban}
            >
              {busy === "unban" ? "..." : "разбанить"}
            </button>
          ) : (
            <button
              style={{ ...styles.btn, ...styles.btnDanger }}
              disabled={!!busy || !!user.deletedAt}
              onClick={onBan}
            >
              {busy === "ban" ? "..." : "забанить"}
            </button>
          )}
          <button
            style={{ ...styles.btn, ...styles.btnDanger }}
            disabled={!!busy}
            onClick={onHardDelete}
          >
            {busy === "hard-delete" ? "..." : "🗑 удалить полностью"}
          </button>
        </div>
      </div>

      {user.buyerProfile && (
        <Card title="Анкета баера">
          <Field label="вакансия">
            {user.buyerProfile.desiredPosition || "—"}
          </Field>
          <Field label="трафик">
            {user.buyerProfile.trafficSources.join(", ") || "—"}
          </Field>
          <Field label="вертикали">
            {user.buyerProfile.verticals.join(", ") || "—"}
          </Field>
          <Field label="гео">
            {user.buyerProfile.geos.join(", ") || "—"}
          </Field>
          <Field label="зп">
            ${user.buyerProfile.budgetMin}–${user.buyerProfile.budgetMax}
          </Field>
          <Field label="опыт">{user.buyerProfile.experience} лет</Field>
          <Field label="активна">
            {user.buyerProfile.isActive ? "да" : "нет"}
          </Field>
          {user.buyerProfile.notes && (
            <pre style={styles.details}>{user.buyerProfile.notes}</pre>
          )}
        </Card>
      )}

      {user.ownerProfile && (
        <Card title="Анкета овнера">
          <Field label="нужен">{user.ownerProfile.offerName}</Field>
          <Field label="трафик">
            {user.ownerProfile.trafficSources.join(", ") || "—"}
          </Field>
          <Field label="вертикали">
            {user.ownerProfile.verticals.join(", ") || "—"}
          </Field>
          <Field label="гео">
            {user.ownerProfile.geos.join(", ") || "—"}
          </Field>
          <Field label="выплата">
            ${user.ownerProfile.payoutMin}–${user.ownerProfile.payoutMax}
          </Field>
          <Field label="активна">
            {user.ownerProfile.isActive ? "да" : "нет"}
          </Field>
          {user.ownerProfile.requirements && (
            <pre style={styles.details}>{user.ownerProfile.requirements}</pre>
          )}
          {user.ownerProfile.bio && (
            <pre style={styles.details}>{user.ownerProfile.bio}</pre>
          )}
        </Card>
      )}

      {user.recentReportsAgainst.length > 0 && (
        <Card
          title={`Жалобы на пользователя (${user.recentReportsAgainst.length})`}
        >
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
                    → {translateResolutionLabel(r.resolution)}
                  </span>
                )}
              </div>
              <div style={{ color: palette.textDim }}>
                от {r.reporterAnonId ?? "?"}
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
        <Card title={`Недавние чаты (${user.recentChats.length})`}>
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
                с{" "}
                <button
                  style={{ ...styles.btn, ...styles.btnGhost, padding: "0 2px" }}
                  onClick={() => onOpenUser(c.otherUserId)}
                >
                  {c.otherAnonId ?? c.otherUserId.slice(0, 8)}
                </button>{" "}
                · {c.messagesCount} сообщ.
                {c.lastMessageAt && (
                  <span style={{ color: palette.textDim, marginLeft: 6 }}>
                    последнее: {fmt(c.lastMessageAt)}
                  </span>
                )}
              </div>
              <button
                style={styles.btn}
                onClick={() => onOpenChat(c.chatId)}
              >
                открыть чат
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

function translateResolutionLabel(raw: string | null): string {
  if (raw === "no_action") return "без мер";
  if (raw === "warned") return "предупреждение";
  if (raw === "banned") return "бан";
  return raw ?? "—";
}

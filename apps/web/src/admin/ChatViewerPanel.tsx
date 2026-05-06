import { useCallback, useEffect, useState } from "react";
import type { AdminChatTranscript } from "@tg-app-meet/shared";
import { adminApi } from "./admin-api";
import { palette, pillFor, styles } from "./admin-styles";

type State =
  | { status: "loading" }
  | { status: "ready"; transcript: AdminChatTranscript }
  | { status: "error"; error: string };

export function ChatViewerPanel({
  token,
  chatId,
  onClose,
  onOpenUser,
}: {
  token: string;
  chatId: string;
  onClose: () => void;
  onOpenUser: (id: string) => void;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const transcript = await adminApi.chatTranscript(token, chatId);
      setState({ status: "ready", transcript });
    } catch (e) {
      setState({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [token, chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <div
        style={{ ...styles.modal, maxWidth: 700 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...styles.toolbar, justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>
            Chat <code style={{ fontSize: 12 }}>{chatId.slice(0, 12)}</code>
          </h2>
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
          <Transcript
            transcript={state.transcript}
            onOpenUser={onOpenUser}
          />
        )}
      </div>
    </div>
  );
}

function Transcript({
  transcript,
  onOpenUser,
}: {
  transcript: AdminChatTranscript;
  onOpenUser: (id: string) => void;
}) {
  const colorFor = (senderId: string) =>
    senderId === transcript.participants[0]?.id ? "#3a4555" : "#1f3a3a";

  return (
    <>
      <div style={{ ...styles.card, marginBottom: 12 }}>
        {transcript.participants.map((p) => (
          <div
            key={p.id}
            style={{
              fontSize: 12,
              padding: "4px 0",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <button
              style={{ ...styles.btn, ...styles.btnGhost, padding: "0 4px" }}
              onClick={() => onOpenUser(p.id)}
            >
              <b>{p.anonId ?? "?"}</b>
            </button>
            <span style={{ color: palette.textMuted }}>{p.role ?? "—"}</span>
            {p.username && (
              <span style={{ color: palette.textDim }}>@{p.username}</span>
            )}
            {pillFor(p)}
          </div>
        ))}
      </div>

      <div
        style={{
          maxHeight: "60vh",
          overflowY: "auto",
          padding: 4,
          background: palette.bg,
          border: `1px solid ${palette.border}`,
          borderRadius: 8,
        }}
      >
        {transcript.messages.length === 0 && (
          <p style={{ color: palette.textMuted, textAlign: "center" }}>
            (no messages)
          </p>
        )}
        {transcript.messages.map((m) => (
          <div key={m.id} style={styles.msgRow}>
            <div style={styles.msgMeta}>
              <b>{m.senderAnonId ?? "?"}</b> · {fmt(m.createdAt)}
              {m.editedAt && (
                <span style={{ color: palette.textMuted }}> · edited</span>
              )}
              {m.readAt && (
                <span style={{ color: palette.textMuted }}> · read</span>
              )}
            </div>
            <div
              style={{
                ...styles.bubble,
                background: colorFor(m.senderId),
                alignSelf:
                  m.senderId === transcript.participants[0]?.id
                    ? "flex-start"
                    : "flex-end",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU");
}

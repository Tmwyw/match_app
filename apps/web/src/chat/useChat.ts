import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatHistoryResponse,
  ChatMessage,
  EditMessageInput,
  MessageReadPayload,
  RevealStatus,
  SendMessageAck,
  TypingPayload,
} from "@tg-app-meet/shared";
import { WsClientEvents, WsServerEvents } from "@tg-app-meet/shared";
import { api } from "../api";
import { getChatSocket } from "./socket";

export type LocalMessage = ChatMessage & {
  tempId?: string;
  status?: "sent" | "sending" | "failed";
};

type State =
  | { status: "loading" }
  | { status: "ready"; messages: LocalMessage[]; hasMore: boolean }
  | { status: "error"; error: string };

/** Selected message id while the user is editing — empty = composing fresh. */
export type EditingState = { messageId: string; original: string } | null;

const TYPING_DEBOUNCE_MS = 3_000;

export function useChat(
  chatId: string,
  currentUserId: string,
  currentAnonId: string,
) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [warning, setWarning] = useState<string | null>(null);
  const [revealStatus, setRevealStatus] = useState<RevealStatus | null>(null);
  const [editing, setEditing] = useState<EditingState>(null);
  /** Map of userId → ISO timestamp the typing event expires at. */
  const [typingUntil, setTypingUntil] = useState<Record<string, string>>({});

  const warnTimeout = useRef<number | null>(null);
  /** Highest createdAt we've ever seen — used by reconnect-resync as the
   *  cursor for `?after=`. Null until first history load. */
  const lastSeenAtRef = useRef<string | null>(null);
  /** True after the first history fetch resolves. Reconnect-resync keys off
   *  this so the very first `connect` doesn't double-load history. */
  const hydratedRef = useRef(false);
  const lastTypingSentAt = useRef(0);

  const showWarning = useCallback((msg: string) => {
    setWarning(msg);
    if (warnTimeout.current) window.clearTimeout(warnTimeout.current);
    warnTimeout.current = window.setTimeout(() => setWarning(null), 4000);
  }, []);

  // Helper — keep lastSeenAtRef monotonically increasing.
  const noteLatest = useCallback((iso: string) => {
    if (!lastSeenAtRef.current || iso > lastSeenAtRef.current) {
      lastSeenAtRef.current = iso;
    }
  }, []);

  // 1. Load history + reveal status in parallel.
  useEffect(() => {
    let aborted = false;
    setState({ status: "loading" });
    setRevealStatus(null);
    setEditing(null);
    setTypingUntil({});
    lastSeenAtRef.current = null;
    hydratedRef.current = false;

    api<ChatHistoryResponse>(`/chats/${chatId}/messages?limit=50`)
      .then((h) => {
        if (aborted) return;
        const messages: LocalMessage[] = h.messages.map((m) => ({
          ...m,
          status: "sent",
        }));
        const last = h.messages[h.messages.length - 1];
        if (last) noteLatest(last.createdAt);
        setState({ status: "ready", messages, hasMore: h.hasMore });
        hydratedRef.current = true;
      })
      .catch((e) => {
        if (aborted) return;
        setState({
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      });

    api<RevealStatus>(`/chats/${chatId}/reveal`)
      .then((r) => {
        if (!aborted) setRevealStatus(r);
      })
      .catch(() => {
        // Reveal failure shouldn't break the chat; UI hides the badge if null.
      });

    return () => {
      aborted = true;
    };
  }, [chatId, noteLatest]);

  // 2. Subscribe to live events.
  useEffect(() => {
    const sock = getChatSocket();

    const onNew = (msg: ChatMessage) => {
      noteLatest(msg.createdAt);
      setState((s) =>
        s.status === "ready"
          ? {
              ...s,
              messages: [...s.messages, { ...msg, status: "sent" }],
            }
          : s,
      );
      // Receiving a typed message implies the sender stopped typing.
      setTypingUntil((t) => {
        if (!t[msg.senderId]) return t;
        const next = { ...t };
        delete next[msg.senderId];
        return next;
      });
    };

    const onEdited = (msg: ChatMessage) => {
      noteLatest(msg.createdAt);
      setState((s) =>
        s.status === "ready"
          ? {
              ...s,
              messages: s.messages.map((m) => (m.id === msg.id ? { ...msg, status: "sent" } : m)),
            }
          : s,
      );
    };

    const onRead = (payload: MessageReadPayload) => {
      if (payload.chatId !== chatId) return;
      const ids = new Set(payload.messageIds);
      setState((s) =>
        s.status === "ready"
          ? {
              ...s,
              messages: s.messages.map((m) =>
                ids.has(m.id) ? { ...m, readAt: payload.readAt } : m,
              ),
            }
          : s,
      );
    };

    const onTyping = (payload: TypingPayload) => {
      if (payload.chatId !== chatId) return;
      if (payload.userId === currentUserId) return;
      setTypingUntil((t) => ({ ...t, [payload.userId]: payload.until }));
    };

    // Server pushes a per-user RevealStatus to user-rooms.
    const onReveal = (status: RevealStatus) => setRevealStatus(status);

    const onConnect = () => {
      sock.emit(WsClientEvents.Join, { chatId });
      // Reconnect-resync: only fire if we already had a hydrated state when
      // the socket dropped. The first `connect` after mount happens BEFORE
      // hydration, so this branch is skipped exactly once per chat-open.
      if (hydratedRef.current && lastSeenAtRef.current) {
        const cursor = lastSeenAtRef.current;
        api<ChatHistoryResponse>(
          `/chats/${chatId}/messages?after=${encodeURIComponent(cursor)}`,
        )
          .then((h) => {
            if (h.messages.length === 0) return;
            const last = h.messages[h.messages.length - 1];
            if (last) noteLatest(last.createdAt);
            setState((s) => {
              if (s.status !== "ready") return s;
              const known = new Set(s.messages.map((m) => m.id));
              const fresh = h.messages
                .filter((m) => !known.has(m.id))
                .map<LocalMessage>((m) => ({ ...m, status: "sent" }));
              if (fresh.length === 0) return s;
              return { ...s, messages: [...s.messages, ...fresh] };
            });
          })
          .catch(() => {
            /* resync is best-effort; user can still type */
          });
      }
    };

    sock.on(WsServerEvents.MessageNew, onNew);
    sock.on(WsServerEvents.MessageEdited, onEdited);
    sock.on(WsServerEvents.MessageRead, onRead);
    sock.on(WsServerEvents.Typing, onTyping);
    sock.on(WsServerEvents.RevealUpdated, onReveal);
    sock.on("connect", onConnect);

    if (sock.connected) {
      // Already connected (e.g. switching between chats) — manually trigger
      // the same join + resync path.
      onConnect();
    }

    return () => {
      sock.emit(WsClientEvents.Leave, { chatId });
      sock.off(WsServerEvents.MessageNew, onNew);
      sock.off(WsServerEvents.MessageEdited, onEdited);
      sock.off(WsServerEvents.MessageRead, onRead);
      sock.off(WsServerEvents.Typing, onTyping);
      sock.off(WsServerEvents.RevealUpdated, onReveal);
      sock.off("connect", onConnect);
    };
  }, [chatId, currentUserId, noteLatest]);

  // 3. Send: optimistic + ack-based replacement.
  const send = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      const tempId = "tmp-" + Math.random().toString(36).slice(2, 10);
      const now = new Date().toISOString();
      const optimistic: LocalMessage = {
        id: tempId,
        chatId,
        senderId: currentUserId,
        senderAnonId: currentAnonId,
        // Sender label is only rendered for non-mine bubbles; own optimistic
        // message never displays it, so null is fine.
        senderDisplayName: null,
        content: trimmed,
        createdAt: now,
        editedAt: null,
        readAt: null,
        tempId,
        status: "sending",
      };
      setState((s) =>
        s.status === "ready"
          ? { ...s, messages: [...s.messages, optimistic] }
          : s,
      );

      const sock = getChatSocket();
      sock.emit(
        WsClientEvents.Send,
        { chatId, content: trimmed },
        (ack: SendMessageAck) => {
          setState((s) => {
            if (s.status !== "ready") return s;
            if ("error" in ack) {
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.tempId === tempId ? { ...m, status: "failed" } : m,
                ),
              };
            }
            noteLatest(ack.message.createdAt);
            return {
              ...s,
              messages: s.messages.map((m) =>
                m.tempId === tempId
                  ? { ...ack.message, status: "sent" }
                  : m,
              ),
            };
          });
          if (!("error" in ack) && ack.filtered) {
            showWarning(
              "Часть текста скрыта (контакты — только после взаимного согласия).",
            );
          }
        },
      );
    },
    [chatId, currentUserId, currentAnonId, showWarning, noteLatest],
  );

  // 4. Edit existing message.
  const startEdit = useCallback((m: LocalMessage) => {
    setEditing({ messageId: m.id, original: m.content });
  }, []);
  const cancelEdit = useCallback(() => setEditing(null), []);

  const submitEdit = useCallback(
    (newContent: string) => {
      const trimmed = newContent.trim();
      if (!editing || !trimmed) return;
      // Optimistic: update bubble locally, fall back to server truth on ack.
      const targetId = editing.messageId;
      setState((s) =>
        s.status === "ready"
          ? {
              ...s,
              messages: s.messages.map((m) =>
                m.id === targetId
                  ? { ...m, content: trimmed, editedAt: new Date().toISOString() }
                  : m,
              ),
            }
          : s,
      );
      setEditing(null);

      const sock = getChatSocket();
      const payload: EditMessageInput = {
        chatId,
        messageId: targetId,
        content: trimmed,
      };
      sock.emit(WsClientEvents.Edit, payload, (ack: SendMessageAck) => {
        if ("error" in ack) {
          if (ack.error === "GONE") {
            showWarning("Сообщение слишком старое, нельзя редактировать.");
          } else {
            showWarning(`Ошибка: ${ack.error}`);
          }
          // Best-effort rollback — refetch from server would be safer but
          // requires history; for now we leave the optimistic edit in place
          // and trust the user's next reload to reconcile.
          return;
        }
        setState((s) =>
          s.status === "ready"
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === ack.message.id
                    ? { ...ack.message, status: "sent" }
                    : m,
                ),
              }
            : s,
        );
        if (ack.filtered) {
          showWarning("Часть текста скрыта при редактировании.");
        }
      });
    },
    [chatId, editing, showWarning],
  );

  // 5. Mark a message (and everything before it) as read.
  const markRead = useCallback(
    (messageId: string) => {
      const sock = getChatSocket();
      sock.emit(WsClientEvents.MarkRead, { chatId, messageId });
    },
    [chatId],
  );

  // 6. Typing indicator — debounced so we emit at most one ping per 3s.
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentAt.current < TYPING_DEBOUNCE_MS) return;
    lastTypingSentAt.current = now;
    const sock = getChatSocket();
    sock.emit(WsClientEvents.Typing, { chatId });
  }, [chatId]);

  // 7. Load older messages (infinite scroll up).
  const loadMore = useCallback(async () => {
    if (state.status !== "ready" || !state.hasMore) return;
    const oldest = state.messages[0];
    if (!oldest) return;
    try {
      const h = await api<ChatHistoryResponse>(
        `/chats/${chatId}/messages?limit=50&before=${encodeURIComponent(oldest.createdAt)}`,
      );
      setState((s) =>
        s.status === "ready"
          ? {
              ...s,
              messages: [
                ...h.messages.map<LocalMessage>((m) => ({ ...m, status: "sent" })),
                ...s.messages,
              ],
              hasMore: h.hasMore,
            }
          : s,
      );
    } catch {
      /* swallowed; user can scroll again */
    }
  }, [chatId, state]);

  // 8. Tick to expire typing indicators every second.
  useEffect(() => {
    if (Object.keys(typingUntil).length === 0) return;
    const id = window.setInterval(() => {
      const now = new Date().toISOString();
      setTypingUntil((t) => {
        let changed = false;
        const next: Record<string, string> = {};
        for (const [uid, until] of Object.entries(t)) {
          if (until > now) next[uid] = until;
          else changed = true;
        }
        return changed ? next : t;
      });
    }, 1_000);
    return () => window.clearInterval(id);
  }, [typingUntil]);

  const requestReveal = useCallback(async () => {
    setRevealStatus((s) => (s ? { ...s, meAccepted: true } : s));
    try {
      const next = await api<RevealStatus>(`/chats/${chatId}/reveal`, {
        method: "POST",
      });
      setRevealStatus(next);
    } catch (e) {
      showWarning(e instanceof Error ? e.message : "не удалось");
      try {
        const cur = await api<RevealStatus>(`/chats/${chatId}/reveal`);
        setRevealStatus(cur);
      } catch {
        /* ignore */
      }
    }
  }, [chatId, showWarning]);

  return {
    ...state,
    warning,
    send,
    revealStatus,
    requestReveal,
    editing,
    startEdit,
    cancelEdit,
    submitEdit,
    markRead,
    sendTyping,
    typingUntil,
    loadMore,
  };
}

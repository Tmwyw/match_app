import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatHistoryResponse,
  ChatMessage,
  RevealStatus,
  SendMessageAck,
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

export function useChat(chatId: string, currentUserId: string, currentAnonId: string) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [warning, setWarning] = useState<string | null>(null);
  const [revealStatus, setRevealStatus] = useState<RevealStatus | null>(null);
  const warnTimeout = useRef<number | null>(null);

  const showWarning = useCallback((msg: string) => {
    setWarning(msg);
    if (warnTimeout.current) window.clearTimeout(warnTimeout.current);
    warnTimeout.current = window.setTimeout(() => setWarning(null), 4000);
  }, []);

  // 1. Load history + reveal status in parallel.
  useEffect(() => {
    let aborted = false;
    setState({ status: "loading" });
    setRevealStatus(null);

    api<ChatHistoryResponse>(`/chats/${chatId}/messages?limit=50`)
      .then((h) => {
        if (aborted) return;
        const messages: LocalMessage[] = h.messages.map((m) => ({
          ...m,
          status: "sent",
        }));
        setState({ status: "ready", messages, hasMore: h.hasMore });
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
  }, [chatId]);

  // 2. Subscribe to live events.
  useEffect(() => {
    const sock = getChatSocket();

    const onNew = (msg: ChatMessage) => {
      setState((s) =>
        s.status === "ready"
          ? {
              ...s,
              messages: [...s.messages, { ...msg, status: "sent" }],
            }
          : s,
      );
    };

    // Server pushes a per-user RevealStatus to user-rooms — we get one for
    // every chat we're in. Filter by chatId is implicit: the only reveal we
    // care about right now is for this chat. Other chats' updates are also
    // delivered but harmless because we replace state wholesale on chat
    // switch (effect re-runs and `revealStatus` is reset).
    const onReveal = (status: RevealStatus) => {
      setRevealStatus(status);
    };

    sock.on(WsServerEvents.MessageNew, onNew);
    sock.on(WsServerEvents.RevealUpdated, onReveal);

    const join = () => sock.emit(WsClientEvents.Join, { chatId });
    if (sock.connected) join();
    else sock.once("connect", join);

    return () => {
      sock.emit(WsClientEvents.Leave, { chatId });
      sock.off(WsServerEvents.MessageNew, onNew);
      sock.off(WsServerEvents.RevealUpdated, onReveal);
    };
  }, [chatId]);

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
        content: trimmed,
        createdAt: now,
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
    [chatId, currentUserId, currentAnonId, showWarning],
  );

  const requestReveal = useCallback(async () => {
    // Optimistically flip meAccepted; the POST response (and the WS push)
    // will overwrite with the authoritative status anyway.
    setRevealStatus((s) => (s ? { ...s, meAccepted: true } : s));
    try {
      const next = await api<RevealStatus>(`/chats/${chatId}/reveal`, {
        method: "POST",
      });
      setRevealStatus(next);
    } catch (e) {
      showWarning(e instanceof Error ? e.message : "не удалось");
      // Re-fetch authoritative status to undo the optimistic flip.
      try {
        const cur = await api<RevealStatus>(`/chats/${chatId}/reveal`);
        setRevealStatus(cur);
      } catch {
        /* ignore */
      }
    }
  }, [chatId, showWarning]);

  return { ...state, warning, send, revealStatus, requestReveal };
}

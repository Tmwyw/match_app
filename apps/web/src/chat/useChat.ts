import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatHistoryResponse,
  ChatMessage,
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
  const warnTimeout = useRef<number | null>(null);

  const showWarning = useCallback((msg: string) => {
    setWarning(msg);
    if (warnTimeout.current) window.clearTimeout(warnTimeout.current);
    warnTimeout.current = window.setTimeout(() => setWarning(null), 4000);
  }, []);

  // 1. Load history via REST.
  useEffect(() => {
    let aborted = false;
    setState({ status: "loading" });
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

    sock.on(WsServerEvents.MessageNew, onNew);

    const join = () => sock.emit(WsClientEvents.Join, { chatId });
    if (sock.connected) join();
    else sock.once("connect", join);

    return () => {
      sock.emit(WsClientEvents.Leave, { chatId });
      sock.off(WsServerEvents.MessageNew, onNew);
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

  return { ...state, warning, send };
}

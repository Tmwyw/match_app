import { Lock, Send } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PublicUser, Role } from "@tg-app-meet/shared";
import { AppHeader, Button, CenteredMessage, RoleAvatar, cn } from "../ui";
import { type LocalMessage, useChat } from "./useChat";

type Props = {
  chatId: string;
  currentUser: PublicUser;
  otherAnonId: string;
  otherRole: Role;
  onBack: () => void;
};

export function ChatScreen({
  chatId,
  currentUser,
  otherAnonId,
  otherRole,
  onBack,
}: Props) {
  if (!currentUser.anonId) {
    // Should never happen — chat is reachable only after onboarding.
    return (
      <CenteredMessage>
        <p className="text-tg-hint text-sm">профиль не готов</p>
      </CenteredMessage>
    );
  }

  return (
    <ChatScreenInner
      chatId={chatId}
      currentUserId={currentUser.id}
      currentAnonId={currentUser.anonId}
      otherAnonId={otherAnonId}
      otherRole={otherRole}
      onBack={onBack}
    />
  );
}

function ChatScreenInner({
  chatId,
  currentUserId,
  currentAnonId,
  otherAnonId,
  otherRole,
  onBack,
}: {
  chatId: string;
  currentUserId: string;
  currentAnonId: string;
  otherAnonId: string;
  otherRole: Role;
  onBack: () => void;
}) {
  const chat = useChat(chatId, currentUserId, currentAnonId);
  const [input, setInput] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when a message arrives or we land on the screen.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.status, chat.status === "ready" ? chat.messages.length : 0]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    chat.send(input);
    setInput("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as FormEvent);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-tg-bg">
      <div className="px-4">
        <AppHeader
          title={otherAnonId}
          onBack={onBack}
          right={<RoleAvatar role={otherRole} size="sm" />}
        />
      </div>

      <Disclaimer />

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2"
      >
        {chat.status === "loading" && (
          <p className="text-tg-hint text-sm text-center mt-4">
            загружаем историю…
          </p>
        )}
        {chat.status === "error" && (
          <p className="text-danger text-sm text-center mt-4">{chat.error}</p>
        )}
        {chat.status === "ready" && chat.messages.length === 0 && (
          <p className="text-tg-hint text-sm text-center mt-6">
            Пока тихо. Напиши первый.
          </p>
        )}
        {chat.status === "ready" &&
          chat.messages.map((m, i) => {
            const prev = chat.messages[i - 1];
            const groupedWithPrev = prev && prev.senderId === m.senderId;
            return (
              <Bubble
                key={m.id}
                msg={m}
                mine={m.senderId === currentUserId}
                grouped={!!groupedWithPrev}
              />
            );
          })}
      </div>

      {chat.warning && (
        <div className="mx-4 mb-2 rounded-button bg-danger-muted text-danger text-xs px-3 py-2">
          {chat.warning}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2 px-4 pt-2 pb-4 border-t border-app-border bg-tg-bg safe-bottom"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={2000}
          placeholder="сообщение…"
          className={cn(
            "flex-1 max-h-32 rounded-input bg-card text-tg-text placeholder:text-tg-hint",
            "border border-app-border px-4 py-2.5 text-base outline-none transition resize-none",
            "focus:border-accent focus:ring-2 focus:ring-accent/40",
          )}
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={!input.trim()}
          className="h-10 w-10 p-0"
          aria-label="отправить"
        >
          <Send size={18} />
        </Button>
      </form>
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="mx-4 my-2 rounded-button bg-card border border-app-border px-3 py-2 flex items-start gap-2">
      <Lock size={14} className="text-tg-hint mt-0.5 shrink-0" />
      <p className="text-xs text-tg-hint">
        Анонимный чат. Контакты скрыты до взаимного согласия — ссылки и юзернеймы автоматически вырезаются.
      </p>
    </div>
  );
}

function Bubble({
  msg,
  mine,
  grouped,
}: {
  msg: LocalMessage;
  mine: boolean;
  grouped: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col max-w-[80%]",
        mine ? "self-end items-end" : "self-start items-start",
        grouped && "mt-[-4px]",
      )}
    >
      {!mine && !grouped && (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-tg-hint mb-0.5 px-3">
          {msg.senderAnonId}
        </span>
      )}
      <div
        className={cn(
          "rounded-card px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
          mine
            ? "bg-accent text-accent-text"
            : "bg-card-elevated text-tg-text border border-app-border",
          msg.status === "failed" && "ring-2 ring-danger",
        )}
      >
        {msg.content}
      </div>
      <span
        className={cn(
          "text-[10px] mt-0.5 px-2",
          msg.status === "failed" ? "text-danger" : "text-tg-hint",
        )}
      >
        {msg.status === "sending"
          ? "отправляется…"
          : msg.status === "failed"
            ? "не отправлено"
            : new Date(msg.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
      </span>
    </div>
  );
}

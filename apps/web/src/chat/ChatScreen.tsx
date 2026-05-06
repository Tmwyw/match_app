import { Check, CheckCheck, Lock, LockOpen, Send, X } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PublicUser, Role, RevealStatus } from "@tg-app-meet/shared";
import { api, ApiError } from "../api";
import { openTelegramUsername } from "../telegram";
import { AppHeader, Background, Button, CenteredMessage, RoleAvatar, cn } from "../ui";
import { ChatMenu } from "./ChatMenu";
import { relativeRu } from "./relativeTime";
import { ReportDialog } from "./ReportDialog";
import { type LocalMessage, useChat } from "./useChat";
import { usePresence } from "./usePresence";

type Props = {
  chatId: string;
  currentUser: PublicUser;
  otherUserId: string;
  otherAnonId: string;
  otherDisplayName: string | null;
  otherRole: Role;
  onBack: () => void;
  /** Called after the user blocks the partner from the chat menu. */
  onBlocked: () => void;
};

export function ChatScreen({
  chatId,
  currentUser,
  otherUserId,
  otherAnonId,
  otherDisplayName,
  otherRole,
  onBack,
  onBlocked,
}: Props) {
  if (!currentUser.anonId) {
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
      otherUserId={otherUserId}
      otherAnonId={otherAnonId}
      otherDisplayName={otherDisplayName}
      otherRole={otherRole}
      onBack={onBack}
      onBlocked={onBlocked}
    />
  );
}

function ChatScreenInner({
  chatId,
  currentUserId,
  currentAnonId,
  otherUserId,
  otherAnonId,
  otherDisplayName,
  otherRole,
  onBack,
  onBlocked,
}: {
  chatId: string;
  currentUserId: string;
  currentAnonId: string;
  otherUserId: string;
  otherAnonId: string;
  otherDisplayName: string | null;
  otherRole: Role;
  onBack: () => void;
  onBlocked: () => void;
}) {
  // Single source of truth for what to call the other user across the chat —
  // their picked nickname if any, otherwise their auto anonId.
  const otherDisplay = otherDisplayName ?? otherAnonId;
  const chat = useChat(chatId, currentUserId, currentAnonId);
  const presence = usePresence(otherUserId);

  const [input, setInput] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | null>(null);

  // Sync the composer with the editing target — entering edit mode loads
  // the original text; exiting edit mode wipes the draft so we don't
  // accidentally re-send the old content as a new message.
  const editingId = chat.editing?.messageId ?? null;
  const editingOriginal = chat.editing?.original ?? null;
  useEffect(() => {
    if (editingOriginal !== null) setInput(editingOriginal);
    else setInput("");
  }, [editingId, editingOriginal]);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };

  const handleBlock = async () => {
    const ok = window.confirm(
      `Заблокировать ${otherDisplay}?\n\nВы перестанете видеть друг друга в поиске и не сможете писать.`,
    );
    if (!ok) return;
    try {
      await api(`/blocks/${otherUserId}`, { method: "POST" });
      onBlocked();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      showToast(`Не удалось заблокировать: ${msg}`);
    }
  };

  // Auto-scroll to the bottom on new messages — but NOT on history loadMore
  // (which prepends). We detect prepend by remembering the previous oldest
  // id and skipping the auto-scroll when only the head moved.
  const lastBottomIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || chat.status !== "ready") return;
    const newest = chat.messages[chat.messages.length - 1];
    if (!newest) return;
    if (newest.id === lastBottomIdRef.current) return;
    lastBottomIdRef.current = newest.id;
    // Defer to next paint so the new bubble is in the DOM.
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [chat.status, chat.status === "ready" ? chat.messages : null]);

  // Mark messages read whenever the latest INCOMING message changes. Tracks
  // the last id we acked so reopening the chat doesn't re-spam the WS.
  const lastReadAckedRef = useRef<string | null>(null);
  useEffect(() => {
    if (chat.status !== "ready") return;
    const latest = [...chat.messages].reverse().find((m) => m.senderId !== currentUserId && !m.tempId);
    if (!latest) return;
    if (latest.id === lastReadAckedRef.current) return;
    lastReadAckedRef.current = latest.id;
    chat.markRead(latest.id);
  }, [chat, currentUserId]);

  // Infinite scroll up: IntersectionObserver on the top sentinel. Capture
  // scrollHeight BEFORE the loadMore() prepends, then in the next layout
  // shift scrollTop by the delta so the user's anchor stays still.
  const loadingMoreRef = useRef(false);
  const heightBeforeRef = useRef(0);
  useEffect(() => {
    if (chat.status !== "ready" || !chat.hasMore) return;
    const root = scrollerRef.current;
    const sentinel = topSentinelRef.current;
    if (!root || !sentinel) return;

    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e?.isIntersecting || loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        heightBeforeRef.current = root.scrollHeight;
        void chat.loadMore().finally(() => {
          requestAnimationFrame(() => {
            const delta = root.scrollHeight - heightBeforeRef.current;
            if (delta > 0) root.scrollTop += delta;
            loadingMoreRef.current = false;
          });
        });
      },
      { root, rootMargin: "200px 0px 0px 0px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [chat]);

  const onInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    chat.sendTyping();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    if (chat.editing) {
      chat.submitEdit(trimmed);
    } else {
      chat.send(trimmed);
    }
    setInput("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as FormEvent);
    } else if (e.key === "Escape" && chat.editing) {
      chat.cancelEdit();
    }
  };

  // Header subtitle: typing > online > relative last seen.
  const typingActive =
    !!chat.typingUntil[otherUserId] &&
    new Date(chat.typingUntil[otherUserId]) > new Date();
  const headerSubtitle = useMemo(() => {
    if (typingActive) return "печатает…";
    if (!presence) return null;
    if (presence.online) return "в сети";
    return relativeRu(presence.lastSeen);
  }, [typingActive, presence]);

  return (
    <div className="fixed inset-0 z-30 flex flex-col">
      <Background />
      <div className="relative z-10 flex flex-col flex-1 min-h-0 bg-tg-bg-deep/30 backdrop-blur-md">
      <AppHeader
        title={otherDisplay}
        subtitle={headerSubtitle}
        subtitleAccent={typingActive || presence?.online}
        onBack={onBack}
        right={
          <div className="flex items-center gap-1">
            <RoleAvatar role={otherRole} size="sm" />
            <ChatMenu
              onReport={() => setReportOpen(true)}
              onBlock={handleBlock}
            />
          </div>
        }
      />

      <RevealBanner
        status={chat.revealStatus}
        onRequestReveal={chat.requestReveal}
      />

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2"
      >
        {chat.status === "ready" && chat.hasMore && (
          <div ref={topSentinelRef} className="h-px" aria-hidden />
        )}
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
            const mine = m.senderId === currentUserId;
            return (
              <Bubble
                key={m.id}
                msg={m}
                mine={mine}
                grouped={!!groupedWithPrev}
                onEditRequest={mine ? () => chat.startEdit(m) : undefined}
                onCopy={() => copyToClipboard(m.content, showToast)}
              />
            );
          })}
      </div>

      {chat.warning && (
        <div className="mx-4 mb-2 rounded-button bg-danger-muted text-danger text-xs px-3 py-2">
          {chat.warning}
        </div>
      )}
      {toast && (
        <div className="mx-4 mb-2 rounded-button bg-card-elevated border border-app-border text-tg-text text-xs px-3 py-2">
          {toast}
        </div>
      )}

      {reportOpen && (
        <ReportDialog
          targetUserId={otherUserId}
          chatId={chatId}
          onClose={() => setReportOpen(false)}
          onSuccess={() => {
            setReportOpen(false);
            showToast("Жалоба отправлена. Спасибо!");
          }}
        />
      )}

      {chat.editing && (
        <div className="mx-4 mb-1 mt-1 px-3 py-2 rounded-button bg-card-elevated border border-app-border flex items-center justify-between gap-2">
          <span className="text-xs text-tg-hint truncate">
            редактируем сообщение
          </span>
          <button
            type="button"
            onClick={chat.cancelEdit}
            className="-mr-1 p-1 text-tg-hint active:text-tg-text"
            aria-label="отменить редактирование"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2 px-4 pt-2 pb-4 border-t border-app-border glass-strong safe-bottom"
      >
        <textarea
          value={input}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={2000}
          placeholder={chat.editing ? "новый текст…" : "сообщение…"}
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
          aria-label={chat.editing ? "сохранить" : "отправить"}
        >
          {chat.editing ? <Check size={18} /> : <Send size={18} />}
        </Button>
      </form>
      </div>
    </div>
  );
}

function copyToClipboard(text: string, onResult: (msg: string) => void) {
  // navigator.clipboard requires HTTPS or localhost — both fine in our setup.
  try {
    void navigator.clipboard.writeText(text);
    onResult("Скопировано");
  } catch {
    onResult("Не удалось скопировать");
  }
}

function RevealBanner({
  status,
  onRequestReveal,
}: {
  status: RevealStatus | null;
  onRequestReveal: () => Promise<void> | void;
}) {
  if (!status) {
    return (
      <BannerShell tone="muted" icon={<Lock size={14} className="text-tg-hint" />}>
        <p className="text-xs text-tg-hint">
          Анонимный чат. Контакты скрыты до взаимного согласия.
        </p>
      </BannerShell>
    );
  }

  const { meAccepted, otherAccepted, otherUsername } = status;

  if (meAccepted && otherAccepted) {
    return (
      <BannerShell tone="success" icon={<LockOpen size={14} className="text-success" />}>
        {otherUsername ? (
          <p className="text-xs text-tg-text">
            Контакт открыт.{" "}
            <button
              type="button"
              onClick={() => openTelegramUsername(otherUsername)}
              className="font-semibold text-accent underline underline-offset-2 active:opacity-70"
            >
              @{otherUsername}
            </button>
          </p>
        ) : (
          <p className="text-xs text-tg-hint">
            Контакт открыт, но собеседник скрыл @username в Telegram. Попроси его установить и обнови чат.
          </p>
        )}
      </BannerShell>
    );
  }

  if (meAccepted && !otherAccepted) {
    return (
      <BannerShell tone="muted" icon={<Lock size={14} className="text-tg-hint" />}>
        <p className="text-xs text-tg-hint">
          Ты разрешил обмен контактами. Ждём собеседника.
        </p>
      </BannerShell>
    );
  }

  const text = otherAccepted
    ? "Собеседник готов открыть контакт. Сделай шаг навстречу?"
    : "Анонимный чат · контакты скрыты до взаимного согласия.";

  const onClick = () => {
    const ok = window.confirm(
      "Открыть свой контакт?\n\nСобеседник увидит твой @username и сможет написать тебе в личку напрямую.",
    );
    if (!ok) return;
    void onRequestReveal();
  };

  return (
    <BannerShell tone="muted" icon={<Lock size={14} className="text-tg-hint" />}>
      <div className="flex-1 flex items-center justify-between gap-2">
        <p className="text-xs text-tg-hint">{text}</p>
        <Button
          variant="primary"
          size="md"
          onClick={onClick}
          className="shrink-0 whitespace-nowrap"
        >
          Открыть контакт
        </Button>
      </div>
    </BannerShell>
  );
}

function BannerShell({
  tone,
  icon,
  children,
}: {
  tone: "muted" | "success";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-4 my-2 rounded-button border px-3 py-2 flex items-start gap-2 bg-card",
        tone === "success" ? "border-app-border-strong" : "border-app-border",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

const LONG_PRESS_MS = 500;

function Bubble({
  msg,
  mine,
  grouped,
  onEditRequest,
  onCopy,
}: {
  msg: LocalMessage;
  mine: boolean;
  grouped: boolean;
  onEditRequest?: () => void;
  onCopy: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const onPointerDown = (_e: ReactPointerEvent<HTMLDivElement>) => {
    cancelLongPress();
    longPressTimer.current = window.setTimeout(() => {
      setMenuOpen(true);
    }, LONG_PRESS_MS);
  };
  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setMenuOpen(true);
  };

  // Close on outside tap.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [menuOpen]);

  return (
    <div
      className={cn(
        "flex flex-col max-w-[80%] relative",
        mine ? "self-end items-end" : "self-start items-start",
        grouped && "mt-[-4px]",
      )}
    >
      {!mine && !grouped && (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-tg-hint mb-0.5 px-3">
          {msg.senderDisplayName ?? msg.senderAnonId}
        </span>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onContextMenu={onContextMenu}
        className={cn(
          "rounded-card px-3.5 py-2 text-sm whitespace-pre-wrap break-words select-none",
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
          "text-[10px] mt-0.5 px-2 flex items-center gap-1",
          msg.status === "failed" ? "text-danger" : "text-tg-hint",
        )}
      >
        {msg.status === "sending" ? (
          "отправляется…"
        ) : msg.status === "failed" ? (
          "не отправлено"
        ) : (
          <>
            <span>
              {new Date(msg.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {msg.editedAt && <span>(изм.)</span>}
            {mine && (msg.readAt ? <CheckCheck size={12} /> : <Check size={12} />)}
          </>
        )}
      </span>

      {menuOpen && (
        <div
          className={cn(
            "absolute top-full mt-1 z-50 rounded-card bg-card border border-app-border shadow-action flex flex-col p-1 min-w-[140px]",
            mine ? "right-0" : "left-0",
          )}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {onEditRequest && (
            <button
              type="button"
              className="px-3 py-2 text-sm text-left rounded-button hover:bg-card-elevated active:bg-card-elevated text-tg-text"
              onClick={() => {
                setMenuOpen(false);
                onEditRequest();
              }}
            >
              Редактировать
            </button>
          )}
          <button
            type="button"
            className="px-3 py-2 text-sm text-left rounded-button hover:bg-card-elevated active:bg-card-elevated text-tg-text"
            onClick={() => {
              setMenuOpen(false);
              onCopy();
            }}
          >
            Скопировать
          </button>
        </div>
      )}
    </div>
  );
}

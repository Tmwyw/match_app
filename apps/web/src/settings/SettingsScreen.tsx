import { Bell, LifeBuoy, Moon, Palette, RotateCcw, Sun, Trash2, UserMinus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
  BlocksResponse,
  NotificationPrefsResponse,
} from "@tg-app-meet/shared";
import { api, ApiError } from "../api";
import { type Theme, useTheme } from "../theme";
import { AppHeader, Background, Button, Card, RoleAvatar, Screen, cn } from "../ui";
import { Modal, ModalConfirmFooter } from "../ui/Modal";

type Props = {
  onClose: () => void;
  /** Called after the user confirms account deletion (DELETE /me succeeded). */
  onDeleted: () => void;
};

type State =
  | { status: "loading" }
  | { status: "ready"; blocks: BlocksResponse }
  | { status: "error"; error: string };

/** Two-step modal for account deletion: first soft confirm, then a final
 *  "type DELETE" gate. Soft-delete is irreversible from the user side, so
 *  the friction is intentional. */
function DeleteAccountFlow({
  onCancel,
  onDeleted,
}: {
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [stage, setStage] = useState<"warn" | "confirm">("warn");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/me", { method: "DELETE" });
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (stage === "warn") {
    return (
      <Modal
        title="Удалить аккаунт?"
        onClose={onCancel}
        footer={
          <ModalConfirmFooter
            confirmLabel="Продолжить"
            onCancel={onCancel}
            onConfirm={() => setStage("confirm")}
            danger
          />
        }
      >
        <p>
          Это удалит твой профиль, свайпы и доступ к чатам. Восстановить
          аккаунт нельзя — придётся писать в поддержку.
        </p>
        <p className="text-tg-hint text-xs">
          Существующие чаты у твоих собеседников останутся, но будут помечены
          как «Аккаунт удалён».
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Точно удалить?"
      onClose={busy ? () => {} : onCancel}
      footer={
        <ModalConfirmFooter
          confirmLabel="Удалить навсегда"
          onCancel={onCancel}
          onConfirm={submit}
          busy={busy}
          danger
          disabled={phrase.trim().toUpperCase() !== "УДАЛИТЬ"}
        />
      }
    >
      <p className="text-tg-hint text-xs">
        Чтобы подтвердить, введи слово <b>УДАЛИТЬ</b>.
      </p>
      <input
        type="text"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        autoFocus
        className="rounded-input bg-card-elevated border border-app-border px-3 py-2 text-sm outline-none focus:border-danger focus:ring-2 focus:ring-danger/40"
      />
      {error && <p className="text-danger text-xs">{error}</p>}
    </Modal>
  );
}

export function SettingsScreen({ onClose, onDeleted }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetSwipesOpen, setResetSwipesOpen] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const blocks = await api<BlocksResponse>("/blocks");
      setState({ status: "ready", blocks });
    } catch (e) {
      setState({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unblock = async (userId: string) => {
    try {
      await api(`/blocks/${userId}`, { method: "DELETE" });
      await load();
    } catch {
      // Failure is rare; reload either way to reflect server truth.
      await load();
    }
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto">
      {/* Render the brand gradient inside the overlay — without it the
          Telegram webview paints flat black under the fixed container. */}
      <Background />
      <Screen className="relative z-10 pb-safe min-h-screen">
        <div className="max-w-md mx-auto flex flex-col gap-5">
          <AppHeader title="Настройки" onBack={onClose} />

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-tg-hint px-1">
              Заблокированные
            </h2>
            {state.status === "loading" && (
              <p className="text-tg-hint text-sm">загружаем…</p>
            )}
            {state.status === "error" && (
              <p className="text-danger text-sm">{state.error}</p>
            )}
            {state.status === "ready" && state.blocks.length === 0 && (
              <p className="text-tg-hint text-sm">Никого не блокировал.</p>
            )}
            {state.status === "ready" &&
              state.blocks.map((b) => (
                <Card key={b.userId} className="flex items-center gap-3">
                  <RoleAvatar role={b.role ?? "BUYER"} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">
                      {b.displayName ?? b.anonId ?? "—"}
                    </div>
                    <div className="text-xs text-tg-hint">
                      {new Date(b.blockedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => unblock(b.userId)}
                    aria-label="разблокировать"
                  >
                    <UserMinus size={16} />
                    Разблокировать
                  </Button>
                </Card>
              ))}
          </section>

          <SupportSection />

          <AppearanceSection />

          <NotificationsSection />

          <section className="flex flex-col gap-2 mt-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-tg-hint px-1">
              Аккаунт
            </h2>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setResetSwipesOpen(true)}
            >
              <RotateCcw size={16} />
              Сбросить просмотренные анкеты
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={16} />
              Удалить аккаунт
            </Button>
          </section>
        </div>
      </Screen>
      {deleteOpen && (
        <DeleteAccountFlow
          onCancel={() => setDeleteOpen(false)}
          onDeleted={onDeleted}
        />
      )}
      {resetSwipesOpen && (
        <ResetSwipesFlow onCancel={() => setResetSwipesOpen(false)} />
      )}
    </div>
  );
}

/** Confirmation modal for resetting the user's swipe history so they can
 *  re-discover everyone again. Existing matches are preserved — only
 *  swipes that didn't produce a match get cleared on the server side. */
function ResetSwipesFlow({ onCancel }: { onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ removed: number } | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ removed: number }>("/me/swipes", {
        method: "DELETE",
      });
      setDone(res);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? `${e.status} ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg);
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal
        title="Готово"
        onClose={onCancel}
        footer={
          <ModalConfirmFooter
            confirmLabel="Закрыть"
            onCancel={onCancel}
            onConfirm={onCancel}
          />
        }
      >
        <p>
          Сброшено {done.removed}{" "}
          {plural(done.removed, "анкета", "анкеты", "анкет")}. Можешь
          возвращаться в «Найти» и смотреть заново.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Сбросить просмотренные?"
      onClose={busy ? () => {} : onCancel}
      footer={
        <ModalConfirmFooter
          confirmLabel="Сбросить"
          onCancel={onCancel}
          onConfirm={submit}
          busy={busy}
        />
      }
    >
      <p>
        Уже свайпнутые анкеты вернутся в очередь. Существующие матчи
        останутся — их анкеты в очередь не вернутся.
      </p>
      {error && <p className="text-danger text-xs">{error}</p>}
    </Modal>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** Support link — opens the brand's Telegram contact (@creometrics).
 *  Window.open with noopener so the host webview hands the link to the
 *  Telegram client which resolves the deep-link natively. */
const SUPPORT_URL = "https://t.me/creometrics";

function SupportSection() {
  const open = () => {
    window.open(SUPPORT_URL, "_blank", "noopener,noreferrer");
  };
  return (
    <section className="flex flex-col gap-2 mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-tg-hint px-1 flex items-center gap-1.5">
        <LifeBuoy size={12} /> Поддержка
      </h2>
      <Card className="flex items-center gap-3 p-4">
        <LifeBuoy size={18} className="text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">🤝 Связаться с нами</div>
          <div className="text-[11px] text-tg-hint">
            Напиши в @creometrics — ответим в рабочие часы.
          </div>
        </div>
        <Button variant="primary" size="md" onClick={open}>
          Открыть
        </Button>
      </Card>
    </section>
  );
}

/**
 * Theme toggle — light is the default. Choice is persisted by useTheme()
 * and applied to <html data-theme>. Every Tailwind utility consumed in
 * the app routes through the CSS vars in styles.css, so this single
 * attribute swap re-themes the whole UI without component-level work.
 */
function AppearanceSection() {
  const [theme, setTheme] = useTheme();
  return (
    <section className="flex flex-col gap-2 mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-tg-hint px-1 flex items-center gap-1.5">
        <Palette size={12} /> Внешний вид
      </h2>
      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="flex flex-col">
          <span className="text-sm text-tg-text font-medium">Тема</span>
          <span className="text-[11px] text-tg-hint">
            Светлая или тёмная — выбор сохранится между сессиями.
          </span>
        </div>
        <div className="flex gap-1 p-1 rounded-button bg-card-elevated border border-app-border shrink-0">
          <ThemeOption
            label="Светлая"
            value="light"
            active={theme === "light"}
            onClick={() => setTheme("light")}
            icon={<Sun size={14} />}
          />
          <ThemeOption
            label="Тёмная"
            value="dark"
            active={theme === "dark"}
            onClick={() => setTheme("dark")}
            icon={<Moon size={14} />}
          />
        </div>
      </Card>
    </section>
  );
}

function ThemeOption({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  value: Theme;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-button transition",
        active
          ? "bg-accent text-accent-text shadow"
          : "text-tg-hint hover:text-tg-text",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotificationPrefsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    api<NotificationPrefsResponse>("/me/notifications")
      .then((p) => {
        if (!aborted) setPrefs(p);
      })
      .catch((e) => {
        if (!aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      aborted = true;
    };
  }, []);

  const patch = async (
    delta: Partial<NotificationPrefsResponse>,
  ): Promise<void> => {
    if (!prefs) return;
    // Optimistic — UX feels instant on the toggles. The server is
    // authoritative, so a failure rolls back.
    const prev = prefs;
    const optimistic = { ...prefs, ...delta } as NotificationPrefsResponse;
    setPrefs(optimistic);
    try {
      const updated = await api<NotificationPrefsResponse>("/me/notifications", {
        method: "PATCH",
        body: JSON.stringify(delta),
      });
      setPrefs(updated);
    } catch (e) {
      setPrefs(prev);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const muteFor = (hours: number) => {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    void patch({ mutedUntil: until });
  };
  const muteUntilTomorrow = () => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(9, 0, 0, 0);
    void patch({ mutedUntil: t.toISOString() });
  };
  const unmute = () => void patch({ mutedUntil: null });

  return (
    <section className="flex flex-col gap-2 mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-tg-hint px-1 flex items-center gap-1.5">
        <Bell size={12} /> Уведомления
      </h2>
      {!prefs && error && <p className="text-danger text-sm">{error}</p>}
      {!prefs && !error && <p className="text-tg-hint text-sm">загружаем…</p>}
      {prefs && (
        <Card className="flex flex-col gap-3 p-4">
          <Toggle
            label="Матчи"
            description="DM при новом мэтче"
            checked={prefs.matches}
            onChange={(v) => void patch({ matches: v })}
          />
          <Toggle
            label="Сообщения"
            description="DM когда тебе пишут офлайн"
            checked={prefs.messages}
            onChange={(v) => void patch({ messages: v })}
          />
          <Toggle
            label="Дайджест"
            description="Один пуш раз в 10 минут вместо отдельных"
            checked={prefs.digestMode}
            onChange={(v) => void patch({ digestMode: v })}
          />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-tg-hint mb-2">
              Не беспокоить
            </div>
            {prefs.mutedUntil ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-tg-text">
                  до {new Date(prefs.mutedUntil).toLocaleString()}
                </span>
                <Button variant="ghost" size="md" onClick={unmute}>
                  Снять
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="md" onClick={() => muteFor(1)}>
                  1 час
                </Button>
                <Button variant="secondary" size="md" onClick={() => muteFor(8)}>
                  8 часов
                </Button>
                <Button variant="secondary" size="md" onClick={muteUntilTomorrow}>
                  до утра
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <div className="flex flex-col">
        <span className="text-sm text-tg-text font-medium">{label}</span>
        {description && (
          <span className="text-[11px] text-tg-hint">{description}</span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative w-10 h-6 rounded-full transition shrink-0",
          checked ? "bg-accent" : "bg-card-elevated border border-app-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}

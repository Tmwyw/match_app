import { Trash2, UserMinus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { BlocksResponse } from "@tg-app-meet/shared";
import { api } from "../api";
import { AppHeader, Button, Card, RoleAvatar, Screen } from "../ui";
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
    <div className="fixed inset-0 z-30 bg-tg-bg overflow-y-auto">
      <Screen className="pb-safe min-h-screen">
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
                      {b.anonId ?? "—"}
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

          <section className="flex flex-col gap-2 mt-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-tg-hint px-1">
              Аккаунт
            </h2>
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
    </div>
  );
}

import { useState } from "react";
import type { PublicUser, Role } from "@tg-app-meet/shared";
import { api } from "../api";

export function RolePicker({ onDone }: { onDone: () => void }) {
  const [submitting, setSubmitting] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (role: Role) => {
    setSubmitting(role);
    setError(null);
    try {
      await api<PublicUser>("/onboarding/role", {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(null);
    }
  };

  return (
    <main className="min-h-full flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold text-center">Кто ты?</h1>
      <p className="text-tg-hint text-sm text-center max-w-sm">
        Выбери роль один раз — после этого её не сменить. Все диалоги анонимны до взаимного согласия.
      </p>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        <RoleCard
          title="Я баер"
          desc="Закупаю трафик на офферы. Ищу прямых рекламодателей."
          disabled={submitting !== null}
          loading={submitting === "BUYER"}
          onClick={() => pick("BUYER")}
        />
        <RoleCard
          title="Я овнер"
          desc="У меня свой оффер. Ищу баеров под закупку."
          disabled={submitting !== null}
          loading={submitting === "OWNER"}
          onClick={() => pick("OWNER")}
        />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
    </main>
  );
}

function RoleCard({
  title,
  desc,
  loading,
  disabled,
  onClick,
}: {
  title: string;
  desc: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-tg-hint/30 bg-tg-secondary-bg p-5 text-left disabled:opacity-50 hover:bg-tg-secondary-bg/80 transition"
    >
      <div className="font-semibold text-lg">{title}</div>
      <div className="text-tg-hint text-sm mt-1">{desc}</div>
      {loading && <div className="text-tg-hint text-xs mt-2">сохраняем…</div>}
    </button>
  );
}

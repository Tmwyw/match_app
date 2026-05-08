import { ArrowRight } from "lucide-react";
import { useState } from "react";
import type { PublicUser, Role } from "@tg-app-meet/shared";
import { api } from "../api";
import { Button, Card, Logo, RoleAvatar, Screen } from "../ui";

type RoleOption = {
  role: Role;
  title: string;
  desc: string;
};

const OPTIONS: RoleOption[] = [
  {
    role: "BUYER",
    title: "Хочу найти оффер / проект",
    desc: "Хочу найти подходящие вакансии и проекты в арбитраже трафика.",
  },
  {
    role: "OWNER",
    title: "Я Owner, ищу специалистов",
    desc: "Хочу найти людей в команду или под свой проект.",
  },
];

export function RolePicker({ onDone }: { onDone: () => void }) {
  const [selected, setSelected] = useState<Role | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api<PublicUser>("/onboarding/role", {
        method: "POST",
        body: JSON.stringify({ role: selected }),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  return (
    <Screen className="flex flex-col gap-6 pb-safe min-h-screen">
      <div className="flex flex-col items-center text-center mt-6 mb-2 gap-3">
        <Logo glow size={88} />
        <h1 className="text-3xl font-bold">Давайте начнём</h1>
        <p className="text-tg-hint text-sm max-w-sm">
          Выберите, ради чего вы здесь: заполните анкету и находите
          подходящие вакансии.
        </p>
      </div>

      <div className="flex flex-col gap-3 max-w-md w-full mx-auto">
        {OPTIONS.map((opt) => (
          <Card
            key={opt.role}
            active={selected === opt.role}
            onClick={() => setSelected(opt.role)}
            className="flex items-center gap-4"
          >
            <RoleAvatar role={opt.role} size="lg" />
            <div className="flex-1">
              <div className="font-semibold text-lg">{opt.title}</div>
              <div className="text-tg-hint text-sm mt-0.5">{opt.desc}</div>
            </div>
          </Card>
        ))}
      </div>

      {error && (
        <p className="text-danger text-sm text-center">{error}</p>
      )}

      <div className="mt-auto max-w-md w-full mx-auto">
        <Button
          fullWidth
          variant="primary"
          disabled={!selected || submitting}
          onClick={submit}
        >
          {submitting ? "сохраняем…" : "Продолжить"}
          {!submitting && <ArrowRight size={18} />}
        </Button>
      </div>
    </Screen>
  );
}

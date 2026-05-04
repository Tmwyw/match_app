import { useState } from "react";
import {
  BuyerProfileInput,
  Geo,
  type MyBuyerProfile,
  type MyProfileResponse,
  Vertical,
} from "@tg-app-meet/shared";
import { api } from "../api";
import { Chips } from "./Chips";

type Props = {
  initial?: MyBuyerProfile;
  onSaved: () => void;
  onCancel?: () => void;
};

export function BuyerProfileForm({ initial, onSaved, onCancel }: Props) {
  const isEdit = Boolean(initial);
  const [verticals, setVerticals] = useState<Vertical[]>(
    (initial?.verticals as Vertical[]) ?? [],
  );
  const [geos, setGeos] = useState<Geo[]>((initial?.geos as Geo[]) ?? []);
  const [budgetMin, setBudgetMin] = useState<string>(
    initial ? String(initial.budgetMin) : "",
  );
  const [budgetMax, setBudgetMax] = useState<string>(
    initial ? String(initial.budgetMax) : "",
  );
  const [experience, setExperience] = useState<string>(
    initial ? String(initial.experience) : "",
  );
  const [bio, setBio] = useState<string>(initial?.bio ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    const payload = {
      verticals,
      geos,
      budgetMin: Number(budgetMin),
      budgetMax: Number(budgetMax),
      experience: Number(experience),
      bio: bio.trim() || undefined,
    };

    const parsed = BuyerProfileInput.safeParse(payload);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const fieldErrs: Record<string, string> = {};
      for (const [k, v] of Object.entries(flat.fieldErrors)) {
        if (v && v.length) fieldErrs[k] = v[0]!;
      }
      setErrors(fieldErrs);
      return;
    }

    setSubmitting(true);
    try {
      await api<MyProfileResponse>("/me/profile", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify(parsed.data),
      });
      onSaved();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 p-4 max-w-md mx-auto">
      <h1 className="text-2xl font-semibold">
        {isEdit ? "Редактировать профиль" : "Профиль баера"}
      </h1>

      <Field label="Вертикали (1–5)" error={errors.verticals}>
        <Chips options={Vertical.options} value={verticals} onChange={setVerticals} max={5} />
      </Field>

      <Field label="Гео (1–10)" error={errors.geos}>
        <Chips options={Geo.options} value={geos} onChange={setGeos} max={10} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Бюджет от, $" error={errors.budgetMin}>
          <NumberInput value={budgetMin} onChange={setBudgetMin} />
        </Field>
        <Field label="Бюджет до, $" error={errors.budgetMax}>
          <NumberInput value={budgetMax} onChange={setBudgetMax} />
        </Field>
      </div>

      <Field label="Опыт, лет" error={errors.experience}>
        <NumberInput value={experience} onChange={setExperience} />
      </Field>

      <Field label="О себе (опционально)" error={errors.bio}>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={500}
          rows={4}
          className="w-full rounded-lg border border-tg-hint/30 bg-tg-secondary-bg p-2 text-sm"
        />
      </Field>

      {serverError && <p className="text-red-500 text-sm">{serverError}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-lg bg-tg-button text-tg-button-text py-2 font-medium disabled:opacity-50"
        >
          {submitting ? "Сохраняем…" : isEdit ? "Сохранить" : "Создать профиль"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border border-tg-hint/30 px-4 py-2 text-sm"
          >
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-tg-hint">{label}</span>
      {children}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-tg-hint/30 bg-tg-secondary-bg p-2 text-sm"
    />
  );
}

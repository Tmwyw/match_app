import { useState } from "react";
import {
  Geo,
  type MyOwnerProfile,
  type MyProfileResponse,
  OwnerProfileInput,
  PayoutType,
  Vertical,
} from "@tg-app-meet/shared";
import { api } from "../api";
import { Chips } from "./Chips";

type Props = {
  initial?: MyOwnerProfile;
  onSaved: () => void;
  onCancel?: () => void;
};

export function OwnerProfileForm({ initial, onSaved, onCancel }: Props) {
  const isEdit = Boolean(initial);
  const [offerName, setOfferName] = useState<string>(initial?.offerName ?? "");
  const [vertical, setVertical] = useState<Vertical | null>(
    (initial?.vertical as Vertical | undefined) ?? null,
  );
  const [geos, setGeos] = useState<Geo[]>((initial?.geos as Geo[]) ?? []);
  const [payoutType, setPayoutType] = useState<PayoutType | null>(
    (initial?.payoutType as PayoutType | undefined) ?? null,
  );
  const [payoutAmount, setPayoutAmount] = useState<string>(
    initial ? String(initial.payoutAmount) : "",
  );
  const [requirements, setRequirements] = useState<string>(initial?.requirements ?? "");
  const [bio, setBio] = useState<string>(initial?.bio ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    const payload = {
      offerName: offerName.trim(),
      vertical,
      geos,
      payoutType,
      payoutAmount: Number(payoutAmount),
      requirements: requirements.trim() || undefined,
      bio: bio.trim() || undefined,
    };

    const parsed = OwnerProfileInput.safeParse(payload);
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
        {isEdit ? "Редактировать профиль" : "Профиль овнера"}
      </h1>

      <Field label="Название оффера" error={errors.offerName}>
        <input
          type="text"
          value={offerName}
          onChange={(e) => setOfferName(e.target.value)}
          maxLength={100}
          className="w-full rounded-lg border border-tg-hint/30 bg-tg-secondary-bg p-2 text-sm"
        />
      </Field>

      <Field label="Вертикаль" error={errors.vertical}>
        <SingleChip
          options={Vertical.options}
          value={vertical}
          onChange={setVertical}
        />
      </Field>

      <Field label="Гео (1–10)" error={errors.geos}>
        <Chips options={Geo.options} value={geos} onChange={setGeos} max={10} />
      </Field>

      <Field label="Тип выплат" error={errors.payoutType}>
        <SingleChip
          options={PayoutType.options}
          value={payoutType}
          onChange={setPayoutType}
        />
      </Field>

      <Field label="Сумма выплаты, $" error={errors.payoutAmount}>
        <input
          type="number"
          inputMode="numeric"
          value={payoutAmount}
          onChange={(e) => setPayoutAmount(e.target.value)}
          className="w-full rounded-lg border border-tg-hint/30 bg-tg-secondary-bg p-2 text-sm"
        />
      </Field>

      <Field label="Требования к трафику (опционально)" error={errors.requirements}>
        <textarea
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          maxLength={500}
          rows={3}
          className="w-full rounded-lg border border-tg-hint/30 bg-tg-secondary-bg p-2 text-sm"
        />
      </Field>

      <Field label="О себе (опционально)" error={errors.bio}>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={500}
          rows={3}
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

function SingleChip<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            type="button"
            key={opt}
            onClick={() => onChange(opt)}
            className={
              "rounded-full border px-3 py-1 text-sm transition " +
              (active
                ? "border-tg-button bg-tg-button text-tg-button-text"
                : "border-tg-hint/30 bg-tg-secondary-bg text-tg-text")
            }
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

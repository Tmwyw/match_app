import { useState } from "react";
import {
  BuyerProfileInput,
  Geo,
  type MyBuyerProfile,
  type MyProfileResponse,
  Vertical,
} from "@tg-app-meet/shared";
import { api } from "../api";
import {
  AppHeader,
  Button,
  ChipGroup,
  Field,
  Screen,
  Section,
  Textarea,
} from "../ui";

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
  const [budgetMin, setBudgetMin] = useState(
    initial ? String(initial.budgetMin) : "",
  );
  const [budgetMax, setBudgetMax] = useState(
    initial ? String(initial.budgetMax) : "",
  );
  const [experience, setExperience] = useState(
    initial ? String(initial.experience) : "",
  );
  const [bio, setBio] = useState(initial?.bio ?? "");

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
    <Screen className="pb-safe min-h-screen">
      <AppHeader
        title={isEdit ? "Редактирование" : "Профиль баера"}
        onBack={onCancel}
      />
      <form onSubmit={submit} className="flex flex-col gap-6 max-w-md mx-auto pt-2">
        <Section
          title="Источники"
          description="Где закупаешь. Можно выбрать до 5."
        >
          <ChipGroup
            options={Vertical.options}
            value={verticals}
            onChange={setVerticals}
            max={5}
          />
          {errors.verticals && (
            <span className="text-xs text-danger px-1">{errors.verticals}</span>
          )}
        </Section>

        <Section title="Гео" description="Регионы, по которым работаешь.">
          <ChipGroup options={Geo.options} value={geos} onChange={setGeos} max={10} />
          {errors.geos && (
            <span className="text-xs text-danger px-1">{errors.geos}</span>
          )}
        </Section>

        <Section title="Бюджет">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="от, $"
              type="number"
              inputMode="numeric"
              value={budgetMin}
              onChange={(e) => setBudgetMin(e.target.value)}
              error={errors.budgetMin}
            />
            <Field
              label="до, $"
              type="number"
              inputMode="numeric"
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              error={errors.budgetMax}
            />
          </div>
        </Section>

        <Section title="Опыт">
          <Field
            label="лет в арбитраже"
            type="number"
            inputMode="numeric"
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            error={errors.experience}
          />
        </Section>

        <Section title="О себе">
          <Textarea
            placeholder="Кратко: связки, кейсы, чем интересен — опционально."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            error={errors.bio}
            hint={`${bio.length}/500`}
          />
        </Section>

        {serverError && (
          <p className="text-danger text-sm text-center">{serverError}</p>
        )}

        <div className="sticky bottom-0 pt-4 pb-4 bg-tg-bg flex flex-col gap-2">
          <Button type="submit" variant="primary" fullWidth disabled={submitting}>
            {submitting ? "сохраняем…" : isEdit ? "Сохранить" : "Создать профиль"}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={onCancel}
              disabled={submitting}
            >
              Отмена
            </Button>
          )}
        </div>
      </form>
    </Screen>
  );
}

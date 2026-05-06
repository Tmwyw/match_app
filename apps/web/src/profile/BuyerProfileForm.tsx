import { useState } from "react";
import {
  BuyerProfileInput,
  GeoPresets,
  type MyBuyerProfile,
  type MyProfileResponse,
  VerticalPresets,
} from "@tg-app-meet/shared";
import { api } from "../api";
import {
  AppHeader,
  Button,
  Field,
  Screen,
  Section,
  TagInput,
  Textarea,
} from "../ui";

type Props = {
  initial?: MyBuyerProfile;
  onSaved: () => void;
  onCancel?: () => void;
};

export function BuyerProfileForm({ initial, onSaved, onCancel }: Props) {
  const isEdit = Boolean(initial);
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [verticals, setVerticals] = useState<string[]>(initial?.verticals ?? []);
  const [geos, setGeos] = useState<string[]>(initial?.geos ?? []);
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
      displayName: displayName.trim() || null,
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

  // When `onCancel` is set we're in EDIT mode, opened from MyProfile inside
  // the tabbed Home layout. Render as a full-screen overlay so the bottom
  // TabBar doesn't peek through under the sticky submit button.
  // No bg on the overlay — the html gradient should show through. Cards
  // and inputs use translucent glass so the colour underneath bleeds in.
  const wrapperClass = isEdit
    ? "fixed inset-0 z-40 overflow-y-auto"
    : "min-h-screen";

  return (
    <div className={wrapperClass}>
    <Screen noPadding className="pb-safe min-h-screen">
      <AppHeader
        title={isEdit ? "Редактирование" : "Профиль баера"}
        onBack={onCancel}
      />
      <form onSubmit={submit} className="flex flex-col gap-6 max-w-md mx-auto px-4 pt-4">
        <Section
          title="Никнейм"
          description="Под каким именем тебя увидят. Без @, без ссылок. Если оставить пусто — будет анонимный Buyer #N."
        >
          <Field
            placeholder="например, ArbiPro"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            error={errors.displayName}
          />
        </Section>

        <Section
          title="Источники"
          description="Где закупаешь. Выбери из подсказок или добавь свои."
        >
          <TagInput
            presets={VerticalPresets}
            value={verticals}
            onChange={setVerticals}
            max={8}
            placeholder="Своя вертикаль (напр. CRYPTO)"
          />
          {errors.verticals && (
            <span className="text-xs text-danger px-1">{errors.verticals}</span>
          )}
        </Section>

        <Section title="Гео" description="Регионы, по которым работаешь.">
          <TagInput
            presets={GeoPresets}
            value={geos}
            onChange={setGeos}
            max={15}
            placeholder="Своё гео (напр. BR, IN)"
          />
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

        <div className="sticky bottom-0 pt-4 pb-4 bg-tg-bg-deep/85 backdrop-blur-md flex flex-col gap-2">
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
    </div>
  );
}

import type { ReactNode } from "react";
import { useState } from "react";
import {
  type MyOwnerProfile,
  type MyProfileResponse,
  OwnerGeoPresets,
  OwnerIndustryVerticalPresets,
  OwnerProfileInput,
  OwnerTrafficSourcePresets,
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
  initial?: MyOwnerProfile;
  onSaved: () => void;
  onCancel?: () => void;
  /** Mid-onboarding back-out to RolePicker. Only present on first-time fill. */
  onAbort?: () => void | Promise<void>;
};

/**
 * Owner-side onboarding / edit form.
 *
 * Three centered blocks:
 *   1. Краткая информация — имя в профиле, кто нужен, о себе
 *   2. Ваши направления — источник трафика, вертикаль, гео
 *   3. Условия труда      — оплата, дополнительно
 */
export function OwnerProfileForm({ initial, onSaved, onCancel, onAbort }: Props) {
  const isEdit = Boolean(initial);
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [offerName, setOfferName] = useState(initial?.offerName ?? "");
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [trafficSources, setTrafficSources] = useState<string[]>(
    initial?.trafficSources ?? [],
  );
  const [verticals, setVerticals] = useState<string[]>(initial?.verticals ?? []);
  const [geos, setGeos] = useState<string[]>(initial?.geos ?? []);
  const [payoutMin, setPayoutMin] = useState(
    initial ? String(initial.payoutMin) : "",
  );
  const [payoutMax, setPayoutMax] = useState(
    initial ? String(initial.payoutMax) : "",
  );
  const [requirements, setRequirements] = useState(initial?.requirements ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    const payload = {
      displayName: displayName.trim() || null,
      offerName: offerName.trim(),
      trafficSources,
      verticals,
      geos,
      payoutMin: Number(payoutMin),
      payoutMax: Number(payoutMax),
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

  const wrapperClass = isEdit
    ? "fixed inset-0 z-40 overflow-y-auto"
    : "min-h-screen";

  return (
    <div className={wrapperClass}>
      <Screen noPadding className="pb-safe min-h-screen">
        <AppHeader
          title={isEdit ? "Редактирование" : "Заполните анкету профиля"}
          onBack={onCancel}
        />
        <form
          onSubmit={submit}
          className="flex flex-col gap-8 max-w-md mx-auto px-4 pt-4"
        >
          {/* ── Block 1: Краткая информация ───────────────────────── */}
          <Block title="Краткая информация">
            <Section
              title="Имя в профиле"
              description="Так вас будут видеть другие пользователи. Укажите имя или название без @, ссылок и контактов."
            >
              <Field
                placeholder="Например, CreoMetrics"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={32}
                error={errors.displayName}
              />
            </Section>
            <Section
              title="Кто нужен в команду?"
              description="Коротко напишите, кого хотите найти."
            >
              <Field
                placeholder="Кратко, CEO / Buyer / Контенщик"
                value={offerName}
                onChange={(e) => setOfferName(e.target.value)}
                maxLength={100}
                error={errors.offerName}
              />
            </Section>
            <Section
              title="О себе"
              description="Кратко опишите свою команду."
            >
              <Textarea
                placeholder="Команда из 5 человек, льём с 2021…"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={100}
                error={errors.bio}
                hint={`${bio.length}/100`}
              />
            </Section>
          </Block>

          {/* ── Block 2: Ваши направления ─────────────────────────── */}
          <Block title="Ваши направления">
            <Section
              title="Источник трафика"
              description="Выберите под какие источники трафика вам нужен сотрудник. Если вашего варианта нет, нажмите Other."
            >
              <TagInput
                presets={[...OwnerTrafficSourcePresets]}
                value={trafficSources}
                onChange={setTrafficSources}
                max={8}
                /* No custom-value placeholder: spec says "Other" handles that. */
                placeholder=""
                hideCustom
              />
              {errors.trafficSources && (
                <span className="text-xs text-danger px-1">
                  {errors.trafficSources}
                </span>
              )}
            </Section>
            <Section
              title="Вертикаль"
              description="Выберите вертикаль(и), под которые ищете специалиста."
            >
              <TagInput
                presets={[...OwnerIndustryVerticalPresets]}
                value={verticals}
                onChange={setVerticals}
                max={8}
                placeholder="Своя вертикаль"
              />
              {errors.verticals && (
                <span className="text-xs text-danger px-1">
                  {errors.verticals}
                </span>
              )}
            </Section>
            <Section
              title="ГЕО"
              description="Выберите под какие ГЕО вы ищете специалиста."
            >
              <TagInput
                presets={[...OwnerGeoPresets]}
                value={geos}
                onChange={setGeos}
                max={15}
                placeholder=""
                hideCustom
              />
              {errors.geos && (
                <span className="text-xs text-danger px-1">{errors.geos}</span>
              )}
            </Section>
          </Block>

          {/* ── Block 3: Условия труда ────────────────────────────── */}
          <Block title="Условия труда">
            <Section
              title="Оплата"
              description="Укажите зарплатный диапазон, который рассматриваете."
            >
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="от, $"
                  type="number"
                  inputMode="numeric"
                  value={payoutMin}
                  onChange={(e) => setPayoutMin(e.target.value)}
                  error={errors.payoutMin}
                />
                <Field
                  label="до, $"
                  type="number"
                  inputMode="numeric"
                  value={payoutMax}
                  onChange={(e) => setPayoutMax(e.target.value)}
                  error={errors.payoutMax}
                />
              </div>
            </Section>
            <Section title="Дополнительно">
              <Textarea
                placeholder="Укажите всё, что важно знать специалисту и не вошло в анкету."
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                maxLength={100}
                error={errors.requirements}
                hint={`${requirements.length}/100`}
              />
            </Section>
          </Block>

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
            {!isEdit && onAbort && (
              <Button
                type="button"
                variant="ghost"
                fullWidth
                onClick={() => void onAbort()}
                disabled={submitting}
              >
                ← Назад к выбору роли
              </Button>
            )}
          </div>
        </form>
      </Screen>
    </div>
  );
}

/** Centered block header used to group Sections in the owner form. */
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-base font-bold tracking-wide text-tg-text text-center">
        {title}
      </h2>
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  );
}

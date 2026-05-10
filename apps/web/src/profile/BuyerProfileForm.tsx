import type { ReactNode } from "react";
import { useState } from "react";
import {
  BuyerGeoPresets,
  BuyerIndustryVerticalPresets,
  BuyerPositionPresets,
  BuyerProfileInput,
  BuyerTrafficSourcePresets,
  type MyBuyerProfile,
  type MyProfileResponse,
} from "@tg-app-meet/shared";
import { api } from "../api";
import {
  AppHeader,
  Button,
  Field,
  Screen,
  Section,
  Select,
  TagInput,
  Textarea,
} from "../ui";

type Props = {
  initial?: MyBuyerProfile;
  onSaved: () => void;
  /** Called when the user taps the back-arrow on the EDIT version (full-
   *  screen overlay over MyProfile). Distinct from `onAbort`. */
  onCancel?: () => void;
  /** Called when the user, mid-first-time onboarding, wants to back out of
   *  this role and return to RolePicker. We POST DELETE /onboarding/role
   *  before invoking this. Only present on first-time fill (no `initial`). */
  onAbort?: () => void | Promise<void>;
};

/**
 * Buyer-side onboarding / edit form. Mirrors OwnerProfileForm structure:
 *
 *   1. Краткая информация — имя в профиле + интересующая вакансия
 *   2. Профиль работы     — источник трафика, вертикаль, гео
 *   3. Детали сотрудничества — желаемая зарплата, опыт, дополнительно
 */
export function BuyerProfileForm({ initial, onSaved, onCancel, onAbort }: Props) {
  const isEdit = Boolean(initial);
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [desiredPosition, setDesiredPosition] = useState(
    initial?.desiredPosition ?? "",
  );
  const [trafficSources, setTrafficSources] = useState<string[]>(
    initial?.trafficSources ?? [],
  );
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
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    const payload = {
      displayName: displayName.trim() || null,
      desiredPosition: desiredPosition.trim(),
      trafficSources,
      verticals,
      geos,
      budgetMin: Number(budgetMin),
      budgetMax: Number(budgetMax),
      experience: Number(experience),
      notes: notes.trim() || undefined,
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

  // Both modes own their own scroll container — body has
  // overflow: hidden globally (to block iOS rubber-band on the swipe
  // deck), so anything that wants to be taller than the viewport
  // must scroll itself.
  const wrapperClass = isEdit
    ? "fixed inset-0 z-40 overflow-y-auto"
    : "fixed inset-0 z-30 overflow-y-auto";

  return (
    <div className={wrapperClass}>
      <Screen noPadding className="pb-safe min-h-screen">
        <AppHeader
          title={isEdit ? "Редактирование" : "Заполните анкету профиля"}
          onBack={onCancel}
        />
        <form
          onSubmit={submit}
          // pb-24 leaves room for the sticky bottom panel so iOS auto-
          // scrolls focused inputs ABOVE it, not under it.
          className="flex flex-col gap-8 max-w-md mx-auto px-4 pt-4 pb-24"
        >
          {/* ── Block 1: Краткая информация ───────────────────────── */}
          <Block title="Краткая информация">
            <Section
              title="Имя в профиле"
              description="Так вас будут видеть другие пользователи. Укажите имя или название без @, ссылок и контактов. Справа — интересующая вакансия."
            >
              <div className="grid grid-cols-2 gap-3">
                <Field
                  placeholder="например, ArbiPro"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={32}
                  error={errors.displayName}
                />
                <Select
                  value={desiredPosition}
                  onChange={setDesiredPosition}
                  options={BuyerPositionPresets}
                  placeholder="Вакансия"
                  error={errors.desiredPosition}
                />
              </div>
            </Section>
          </Block>

          {/* ── Block 2: Профиль работы ───────────────────────────── */}
          <Block title="Профиль работы">
            <Section
              title="Источник трафика"
              description="Выберите под какие источники трафика ищете работу. Если вашего варианта нет, нажмите Other."
            >
              <TagInput
                presets={[...BuyerTrafficSourcePresets]}
                value={trafficSources}
                onChange={setTrafficSources}
                max={8}
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
              description="Выберите вертикаль(и), в которой ищете работу."
            >
              <TagInput
                presets={[...BuyerIndustryVerticalPresets]}
                value={verticals}
                onChange={setVerticals}
                max={8}
                placeholder=""
                hideCustom
              />
              {errors.verticals && (
                <span className="text-xs text-danger px-1">
                  {errors.verticals}
                </span>
              )}
            </Section>
            <Section
              title="ГЕО"
              description="Выберите под какие ГЕО вы ищете работу."
            >
              <TagInput
                presets={[...BuyerGeoPresets]}
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

          {/* ── Block 3: Детали сотрудничества ────────────────────── */}
          <Block title="Детали сотрудничества">
            <Section title="Желаемая зарплата">
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="от, $"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                  error={errors.budgetMin}
                />
                <Field
                  label="до, $"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  error={errors.budgetMax}
                />
              </div>
            </Section>
            <Section
              title="Опыт"
              description="Укажите свой опыт в сфере, где ищете работу."
            >
              <Field
                label="лет"
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                step={1}
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                error={errors.experience}
              />
            </Section>
            <Section title="Дополнительно">
              <Textarea
                placeholder="Укажите всё, что важно знать работодателю и не вошло в анкету."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={100}
                error={errors.notes}
                hint={`${notes.length}/100`}
              />
            </Section>
          </Block>

          {serverError && (
            <p className="text-danger text-sm text-center">{serverError}</p>
          )}

          <div className="sticky bottom-0 pt-4 pb-4 bg-card-elevated border-t border-app-border flex flex-col gap-2 shadow-[0_-12px_24px_-8px_rgba(0,0,0,0.08)]">
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

/** Centered block header used to group Sections in the buyer form. */
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

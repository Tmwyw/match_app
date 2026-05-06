import { useState } from "react";
import {
  GeoPresets,
  type MyOwnerProfile,
  type MyProfileResponse,
  OwnerProfileInput,
  PayoutTypePresets,
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
  initial?: MyOwnerProfile;
  onSaved: () => void;
  onCancel?: () => void;
};

export function OwnerProfileForm({ initial, onSaved, onCancel }: Props) {
  const isEdit = Boolean(initial);
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [offerName, setOfferName] = useState(initial?.offerName ?? "");
  const [vertical, setVertical] = useState<string[]>(
    initial ? [initial.vertical] : [],
  );
  const [geos, setGeos] = useState<string[]>(initial?.geos ?? []);
  const [payoutTypes, setPayoutTypes] = useState<string[]>(
    initial?.payoutTypes ?? [],
  );
  const [payoutAmount, setPayoutAmount] = useState(
    initial ? String(initial.payoutAmount) : "",
  );
  const [requirements, setRequirements] = useState(initial?.requirements ?? "");
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
      offerName: offerName.trim(),
      vertical: vertical[0],
      geos,
      payoutTypes,
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

  const wrapperClass = isEdit
    ? "fixed inset-0 z-40 overflow-y-auto"
    : "min-h-screen";

  return (
    <div className={wrapperClass}>
    <Screen noPadding className="pb-safe min-h-screen">
      <AppHeader
        title={isEdit ? "Редактирование" : "Профиль овнера"}
        onBack={onCancel}
      />
      <form onSubmit={submit} className="flex flex-col gap-6 max-w-md mx-auto px-4 pt-4">
        <Section
          title="Никнейм"
          description="Под каким именем тебя увидят. Без @, без ссылок. Если оставить пусто — будет анонимный Owner #N."
        >
          <Field
            placeholder="например, OfferKing"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            error={errors.displayName}
          />
        </Section>

        <Section title="Оффер">
          <Field
            label="название"
            placeholder="Кратко, чтобы баер опознал"
            value={offerName}
            onChange={(e) => setOfferName(e.target.value)}
            maxLength={100}
            error={errors.offerName}
          />
        </Section>

        <Section
          title="Вертикаль"
          description="Выбери из подсказок или укажи свою."
        >
          <TagInput
            presets={VerticalPresets}
            value={vertical}
            onChange={setVertical}
            mode="single"
            placeholder="Своя вертикаль"
          />
          {errors.vertical && (
            <span className="text-xs text-danger px-1">{errors.vertical}</span>
          )}
        </Section>

        <Section title="Гео" description="Регионы, на которые льёшь.">
          <TagInput
            presets={GeoPresets}
            value={geos}
            onChange={setGeos}
            max={15}
            placeholder="Своё гео"
          />
          {errors.geos && (
            <span className="text-xs text-danger px-1">{errors.geos}</span>
          )}
        </Section>

        <Section
          title="Выплаты"
          description="Можно выбрать несколько схем или добавить свою."
        >
          <TagInput
            presets={PayoutTypePresets}
            value={payoutTypes}
            onChange={setPayoutTypes}
            max={5}
            placeholder="Своя схема (напр. RevShare-with-Spend)"
          />
          {errors.payoutTypes && (
            <span className="text-xs text-danger px-1">{errors.payoutTypes}</span>
          )}
          <Field
            label="сумма, $"
            type="number"
            inputMode="numeric"
            value={payoutAmount}
            onChange={(e) => setPayoutAmount(e.target.value)}
            error={errors.payoutAmount}
          />
        </Section>

        <Section title="Требования">
          <Textarea
            placeholder="Источники, гео, антифрод — опционально."
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            maxLength={500}
            error={errors.requirements}
            hint={`${requirements.length}/500`}
          />
        </Section>

        <Section title="О себе">
          <Textarea
            placeholder="Что за команда / опыт / условия — опционально."
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

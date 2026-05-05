import { useState } from "react";
import {
  type DiscoverFilters,
  GeoPresets,
  VerticalPresets,
} from "@tg-app-meet/shared";
import { Modal, ModalConfirmFooter } from "../ui/Modal";

type Props = {
  initial: DiscoverFilters;
  onApply: (next: DiscoverFilters) => void;
  onClose: () => void;
};

/**
 * Quick filter sheet — chip-based picker for verticals and geos that
 * only narrows what discover already returns. Empty selection = "all".
 * Custom tags entered via free text aren't supported here; the user can
 * pick from their own profile presets via Vertical/Geo enums.
 */
export function FilterSheet({ initial, onApply, onClose }: Props) {
  const [verticals, setVerticals] = useState<string[]>(initial.verticals);
  const [geos, setGeos] = useState<string[]>(initial.geos);

  const reset = () => {
    setVerticals([]);
    setGeos([]);
  };

  return (
    <Modal
      title="Фильтры"
      onClose={onClose}
      footer={
        <>
          <ModalConfirmFooter
            confirmLabel="Применить"
            onCancel={onClose}
            onConfirm={() => onApply({ verticals, geos })}
          />
          {(verticals.length > 0 || geos.length > 0) && (
            <button
              type="button"
              onClick={reset}
              className="text-xs text-tg-hint underline mt-1 self-center"
            >
              сбросить
            </button>
          )}
        </>
      }
    >
      <Group label="Вертикали" options={[...VerticalPresets]} value={verticals} onChange={setVerticals} />
      <Group label="Гео" options={[...GeoPresets]} value={geos} onChange={setGeos} />
      <p className="text-tg-hint text-[11px]">
        Пусто = без фильтра. Фильтр сужает базовую совместимость.
      </p>
    </Modal>
  );
}

function Group({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (opt: string) => {
    if (value.includes(opt)) onChange(value.filter((v) => v !== opt));
    else onChange([...value, opt]);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-tg-hint">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className={
                "px-2.5 py-1 text-xs font-semibold rounded-chip border " +
                (active
                  ? "bg-accent text-accent-text border-accent"
                  : "bg-card-elevated text-tg-text border-app-border")
              }
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

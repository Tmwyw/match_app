type Props<T extends string> = {
  options: readonly T[];
  value: readonly T[];
  onChange: (next: T[]) => void;
  max?: number;
};

export function Chips<T extends string>({ options, value, onChange, max }: Props<T>) {
  const toggle = (opt: T) => {
    const has = value.includes(opt);
    if (has) {
      onChange(value.filter((v) => v !== opt));
    } else {
      if (max && value.length >= max) return;
      onChange([...value, opt]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value.includes(opt);
        return (
          <button
            type="button"
            key={opt}
            onClick={() => toggle(opt)}
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

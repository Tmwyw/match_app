import { cn } from "./cn";

type Props<T extends string> = {
  options: readonly T[];
  value: readonly T[];
  onChange: (next: T[]) => void;
  max?: number;
  mode?: "multi" | "single";
};

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  max,
  mode = "multi",
}: Props<T>) {
  const toggle = (opt: T) => {
    if (mode === "single") {
      onChange(value[0] === opt ? [] : [opt]);
      return;
    }
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
      return;
    }
    if (max && value.length >= max) return;
    onChange([...value, opt]);
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
            aria-pressed={active}
            className={cn(
              "rounded-chip px-3.5 py-2 text-sm font-medium transition active:scale-[0.97]",
              active
                ? "bg-accent-gradient text-accent-text shadow-glow border border-white/15"
                : "glass text-tg-text hover:border-app-border-strong",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

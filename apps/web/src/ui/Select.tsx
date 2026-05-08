import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[] | readonly { value: string; label: string }[];
  placeholder?: string;
  error?: string;
  className?: string;
};

/**
 * Native `<select>` styled with brand tokens. We use the platform picker
 * instead of a custom dropdown so the iOS/Telegram-mobile webview gives
 * users their native scroll-wheel UX, which feels right for short lists.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  error,
  className,
}: Props) {
  const items = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full appearance-none rounded-input bg-card text-tg-text pl-3 pr-10 py-2.5 text-base outline-none transition",
            "border focus:border-accent focus:ring-2 focus:ring-accent/40",
            value ? "" : "text-tg-hint",
            error ? "border-danger" : "border-app-border",
          )}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {items.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={18}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-tg-hint"
        />
      </div>
      {error && <span className="text-xs text-danger px-1">{error}</span>}
    </div>
  );
}

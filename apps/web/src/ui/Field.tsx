import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

export function Field({ label, error, hint, className, ...rest }: Props) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && (
        <span className="text-xs font-semibold uppercase tracking-wider text-tg-hint px-1">
          {label}
        </span>
      )}
      <input
        {...rest}
        className={cn(
          "h-12 rounded-button bg-card text-tg-text placeholder:text-tg-hint px-4 text-base outline-none transition focus:ring-2 focus:ring-accent/40",
          error && "ring-2 ring-danger/50",
          className,
        )}
      />
      {error ? (
        <span className="text-xs text-danger px-1">{error}</span>
      ) : hint ? (
        <span className="text-xs text-tg-hint px-1">{hint}</span>
      ) : null}
    </label>
  );
}

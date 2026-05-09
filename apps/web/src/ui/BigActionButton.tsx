import type { ReactNode } from "react";
import { cn } from "./cn";

type Variant = "danger" | "info" | "success";

type Props = {
  variant: Variant;
  icon: ReactNode;
  ariaLabel: string;
  onClick?: () => void;
  disabled?: boolean;
};

// White borders used to sit on every variant — they read as a subtle
// rim in dark mode but vanish into the bg in light mode, leaving the
// button looking flat. Saturated solid colours (red/cyan/green) define
// themselves well enough; we lean on the coloured drop-shadow for depth
// in both themes instead.
const variants: Record<Variant, string> = {
  danger: "bg-danger text-white shadow-glow-danger",
  info: "bg-accent-gradient text-accent-text shadow-glow",
  success: "bg-success text-white shadow-glow-success",
};

export function BigActionButton({ variant, icon, ariaLabel, onClick, disabled }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "h-16 w-16 rounded-full flex items-center justify-center transition active:scale-90 disabled:opacity-50 disabled:active:scale-100",
        variants[variant],
      )}
    >
      {icon}
    </button>
  );
}

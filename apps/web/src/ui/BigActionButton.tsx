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

const variants: Record<Variant, string> = {
  danger: "bg-danger text-white shadow-glow-danger border border-white/15",
  info: "bg-accent-gradient text-accent-text shadow-glow border border-white/15",
  success: "bg-success text-white shadow-glow-success border border-white/15",
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

import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "lg" | "md";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
};

const variants: Record<Variant, string> = {
  primary:
    "bg-accent-gradient text-accent-text shadow-glow border border-white/10",
  secondary: "glass text-tg-text hover:border-app-border-strong",
  ghost: "text-accent",
  danger: "bg-danger text-white shadow-glow-danger",
};

const sizes: Record<Size, string> = {
  lg: "h-12 px-6 text-base",
  md: "h-10 px-4 text-sm",
};

export function Button({
  variant = "primary",
  size = "lg",
  fullWidth,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-button font-semibold transition active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

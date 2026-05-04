import type { ReactNode } from "react";
import { cn } from "./cn";

type Props = {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  active?: boolean;
};

export function Card({ children, className, onClick, active }: Props) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "rounded-card bg-card p-4 text-left w-full",
        onClick && "transition active:scale-[0.99]",
        active && "ring-2 ring-accent",
        className,
      )}
    >
      {children}
    </Wrapper>
  );
}

import type { ReactNode } from "react";
import { cn } from "./cn";

type Props = {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
};

export function Screen({ children, className, noPadding }: Props) {
  return (
    <div
      className={cn(
        "min-h-full bg-tg-bg text-tg-text",
        !noPadding && "px-4 pt-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CenteredMessage({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Screen className="flex flex-col items-center justify-center text-center gap-2 min-h-screen">
      {children}
    </Screen>
  );
}

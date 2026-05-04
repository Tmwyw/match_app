import type { ReactNode } from "react";
import { cn } from "./cn";

type Props = {
  title?: string;
  description?: string;
  children: ReactNode;
  /** Wrap children in a Card-like surface. Default false — fields/chips already
   *  have their own visible borders, and stacking surfaces makes the form noisy. */
  surface?: boolean;
  className?: string;
};

export function Section({ title, description, children, surface = false, className }: Props) {
  return (
    <section className={cn("flex flex-col gap-2.5", className)}>
      {(title || description) && (
        <div className="px-1">
          {title && (
            <h3 className="text-xs font-semibold uppercase tracking-wider text-tg-hint">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-xs text-tg-hint mt-0.5">{description}</p>
          )}
        </div>
      )}
      {surface ? (
        <div className="rounded-card bg-card border border-app-border p-4 flex flex-col gap-3">
          {children}
        </div>
      ) : (
        <div className="flex flex-col gap-3">{children}</div>
      )}
    </section>
  );
}

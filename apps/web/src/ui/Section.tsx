import type { ReactNode } from "react";

type Props = {
  title?: string;
  description?: string;
  children: ReactNode;
};

export function Section({ title, description, children }: Props) {
  return (
    <section className="flex flex-col gap-3">
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
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

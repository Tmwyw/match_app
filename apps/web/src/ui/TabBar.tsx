import type { ReactNode } from "react";
import { cn } from "./cn";

export type TabItem<K extends string> = {
  key: K;
  label: string;
  icon: ReactNode;
  /** Optional unread/pending counter rendered as a small pill on the icon. */
  badge?: number;
};

type Props<K extends string> = {
  items: readonly TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
};

export function TabBar<K extends string>({ items, active, onChange }: Props<K>) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 px-3 pb-3 safe-bottom pointer-events-none">
      <div className="max-w-md mx-auto pointer-events-auto glass-strong glass-highlight rounded-card flex shadow-action overflow-hidden">
        {items.map((item) => {
          const isActive = item.key === active;
          const showBadge = typeof item.badge === "number" && item.badge > 0;
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={cn(
                "flex-1 py-3 flex flex-col items-center gap-1 text-[11px] font-medium transition relative",
                isActive ? "text-accent" : "text-tg-hint",
              )}
            >
              <span className="h-6 flex items-center relative">
                {item.icon}
                {showBadge && (
                  <span className="absolute -top-1 -right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-text text-[10px] font-bold flex items-center justify-center border border-card">
                    {item.badge! > 99 ? "99+" : item.badge}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
              {isActive && (
                <span className="absolute -top-px left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-accent shadow-glow" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

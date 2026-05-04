import type { ReactNode } from "react";
import { cn } from "./cn";

export type TabItem<K extends string> = {
  key: K;
  label: string;
  icon: ReactNode;
};

type Props<K extends string> = {
  items: readonly TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
};

export function TabBar<K extends string>({ items, active, onChange }: Props<K>) {
  return (
    <nav className="sticky bottom-0 left-0 right-0 z-20 bg-tg-bg/95 backdrop-blur border-t border-tg-hint/15 safe-bottom">
      <div className="max-w-md mx-auto flex">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={cn(
                "flex-1 py-2 flex flex-col items-center gap-1 text-[11px] font-medium transition",
                isActive ? "text-accent" : "text-tg-hint",
              )}
            >
              <span className="h-6 flex items-center">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

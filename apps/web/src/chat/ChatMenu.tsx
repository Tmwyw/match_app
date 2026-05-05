import { Ban, Flag, MoreVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../ui";

type Props = {
  onReport: () => void;
  onBlock: () => void;
};

/**
 * Three-dots dropdown for the chat header. Click-outside closes;
 * Escape closes. Anchored to the right edge of the trigger.
 */
export function ChatMenu({ onReport, onBlock }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = (
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    danger?: boolean,
  ) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-sm text-left rounded-button",
        "hover:bg-card-elevated active:bg-card-elevated",
        danger ? "text-danger" : "text-tg-text",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="меню"
        className="-mr-2 p-2 rounded-full text-tg-text active:bg-card"
      >
        <MoreVertical size={20} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 rounded-card bg-card border border-app-border shadow-action flex flex-col p-1 z-40">
          {item(<Flag size={16} />, "Пожаловаться", onReport)}
          {item(<Ban size={16} />, "Заблокировать", onBlock, true)}
        </div>
      )}
    </div>
  );
}

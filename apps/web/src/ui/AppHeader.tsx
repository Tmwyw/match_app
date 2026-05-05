import { ChevronLeft } from "lucide-react";
import { cn } from "./cn";

type Props = {
  title: string;
  /** Optional smaller line under the title — used by chat headers for
   *  presence ("в сети", "был N мин назад") and "печатает…". */
  subtitle?: string | null;
  /** Greens up the subtitle (online/typing) instead of the muted hint colour. */
  subtitleAccent?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
};

export function AppHeader({ title, subtitle, subtitleAccent, onBack, right }: Props) {
  return (
    <header className="sticky top-0 z-10 px-4 py-3 glass-strong border-b border-app-border flex items-center gap-2">
      {onBack && (
        <button
          onClick={onBack}
          className="-ml-2 p-2 rounded-full text-tg-text active:bg-white/5"
          aria-label="назад"
        >
          <ChevronLeft size={22} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold truncate leading-tight">{title}</h1>
        {subtitle && (
          <div
            className={cn(
              "text-[11px] mt-0.5 truncate flex items-center gap-1",
              subtitleAccent ? "text-success" : "text-tg-hint",
            )}
          >
            {subtitleAccent && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
            )}
            <span className="truncate">{subtitle}</span>
          </div>
        )}
      </div>
      {right}
    </header>
  );
}

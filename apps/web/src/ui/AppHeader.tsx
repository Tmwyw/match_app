import { ChevronLeft } from "lucide-react";

type Props = {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
};

export function AppHeader({ title, onBack, right }: Props) {
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
      <h1 className="text-lg font-semibold flex-1 truncate">{title}</h1>
      {right}
    </header>
  );
}

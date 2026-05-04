export type Tab = "discover" | "matches" | "profile";

export function Nav({
  current,
  onChange,
}: {
  current: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <nav className="sticky bottom-0 left-0 right-0 border-t border-tg-hint/30 bg-tg-bg">
      <div className="max-w-md mx-auto flex">
        <Item current={current} tab="discover" label="Найти" icon="🔥" onChange={onChange} />
        <Item current={current} tab="matches" label="Матчи" icon="💬" onChange={onChange} />
        <Item current={current} tab="profile" label="Профиль" icon="👤" onChange={onChange} />
      </div>
    </nav>
  );
}

function Item({
  current,
  tab,
  label,
  icon,
  onChange,
}: {
  current: Tab;
  tab: Tab;
  label: string;
  icon: string;
  onChange: (tab: Tab) => void;
}) {
  const active = current === tab;
  return (
    <button
      onClick={() => onChange(tab)}
      className={
        "flex-1 py-2 flex flex-col items-center gap-0.5 text-xs " +
        (active ? "text-tg-button" : "text-tg-hint")
      }
    >
      <span className="text-xl">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

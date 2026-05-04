import { useEffect, useState } from "react";
import { getTelegramUser, getTelegramWebApp } from "./telegram";

// In dev we go through the Vite proxy ("/api" → http://localhost:3001) so the
// Mini App opened over an HTTPS tunnel doesn't hit mixed-content blocking.
// In prod, set VITE_API_URL to your real API origin.
const API_URL = import.meta.env.VITE_API_URL ?? "/api";

type Health = { status: string; db: string; ts: string };

export function App() {
  const [user] = useState(() => getTelegramUser());
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    const tg = getTelegramWebApp();
    tg?.ready();
    tg?.expand();
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setHealthError(String(e)));
  }, []);

  const name = user?.first_name ?? user?.username ?? "stranger";

  return (
    <main className="min-h-full flex flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-semibold">Hello, {name}!</h1>
      {user ? (
        <p className="text-tg-hint text-sm">
          Telegram id: <code>{user.id}</code>
          {user.username ? ` · @${user.username}` : ""}
        </p>
      ) : (
        <p className="text-tg-hint text-sm">
          Open this page from inside Telegram to see your profile.
        </p>
      )}

      <section className="rounded-xl border border-tg-hint/30 px-4 py-3 text-left text-sm w-full max-w-sm">
        <div className="font-medium mb-1">API health</div>
        {healthError && <div className="text-red-500">error: {healthError}</div>}
        {!healthError && !health && <div className="text-tg-hint">checking…</div>}
        {health && (
          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(health, null, 2)}</pre>
        )}
      </section>
    </main>
  );
}

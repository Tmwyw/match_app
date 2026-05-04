import { useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth/useAuth";
import { getTelegramWebApp } from "./telegram";

type Health = { status: string; db: string; ts: string };

export function App() {
  const auth = useAuth();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    const tg = getTelegramWebApp();
    tg?.ready();
    tg?.expand();
  }, []);

  useEffect(() => {
    api<Health>("/health")
      .then(setHealth)
      .catch((e) => setHealthError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main className="min-h-full flex flex-col items-center justify-center gap-6 p-6 text-center">
      <AuthBlock auth={auth} />

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

function AuthBlock({ auth }: { auth: ReturnType<typeof useAuth> }) {
  if (auth.status === "loading") {
    return <p className="text-tg-hint">authenticating…</p>;
  }

  if (auth.status === "needs-telegram") {
    return (
      <p className="text-tg-hint text-sm">
        Open this page from inside Telegram to sign in.
      </p>
    );
  }

  if (auth.status === "error") {
    return (
      <div className="space-y-2">
        <p className="text-red-500 text-sm">auth failed: {auth.error}</p>
        <button
          onClick={auth.refresh}
          className="rounded-lg border border-tg-hint/30 px-3 py-1 text-sm"
        >
          retry
        </button>
      </div>
    );
  }

  const { user } = auth;
  const display = user.username ? `@${user.username}` : `id ${user.telegramId}`;
  return (
    <div className="space-y-2">
      <h1 className="text-3xl font-semibold">Hello, {display}!</h1>
      <p className="text-tg-hint text-sm">
        Authenticated · user id <code>{user.id}</code>
        {user.role ? ` · role ${user.role}` : " · role pending"}
        {user.anonId ? ` · ${user.anonId}` : ""}
      </p>
    </div>
  );
}

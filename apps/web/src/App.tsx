import { useEffect, useState } from "react";
import type { MyProfileResponse, PublicUser, Role } from "@tg-app-meet/shared";
import { api } from "./api";
import { useAuth } from "./auth/useAuth";
import { Deck } from "./discover/Deck";
import { MatchesList } from "./matches/MatchesList";
import { Nav, type Tab } from "./Nav";
import { RolePicker } from "./onboarding/RolePicker";
import { BuyerProfileForm } from "./profile/BuyerProfileForm";
import { MyProfile } from "./profile/MyProfile";
import { OwnerProfileForm } from "./profile/OwnerProfileForm";
import { useProfile } from "./profile/useProfile";
import { getTelegramWebApp } from "./telegram";

type Health = { status: string; db: string; ts: string };

export function App() {
  const auth = useAuth();

  useEffect(() => {
    const tg = getTelegramWebApp();
    tg?.ready();
    tg?.expand();
  }, []);

  if (auth.status === "loading") {
    return <CenteredHint text="authenticating…" />;
  }
  if (auth.status === "needs-telegram") {
    return <CenteredHint text="Open this page from inside Telegram to sign in." />;
  }
  if (auth.status === "error") {
    return (
      <CenteredHint>
        <p className="text-red-500 text-sm">auth failed: {auth.error}</p>
        <button
          onClick={auth.refresh}
          className="mt-2 rounded-lg border border-tg-hint/30 px-3 py-1 text-sm"
        >
          retry
        </button>
      </CenteredHint>
    );
  }

  return (
    <>
      <AuthedFlow user={auth.user} onUserChanged={auth.refresh} />
      {import.meta.env.DEV && <HealthDebug />}
    </>
  );
}

function AuthedFlow({
  user,
  onUserChanged,
}: {
  user: PublicUser;
  onUserChanged: () => void;
}) {
  if (!user.role) {
    return <RolePicker onDone={onUserChanged} />;
  }
  return <ProfileFlow user={user} role={user.role} onUserChanged={onUserChanged} />;
}

function ProfileFlow({
  user,
  role,
  onUserChanged,
}: {
  user: PublicUser;
  role: Role;
  onUserChanged: () => void;
}) {
  const profile = useProfile();

  if (profile.status === "loading") {
    return <CenteredHint text="загружаем профиль…" />;
  }
  if (profile.status === "error") {
    return (
      <CenteredHint>
        <p className="text-red-500 text-sm">{profile.error}</p>
        <button
          onClick={profile.refresh}
          className="mt-2 rounded-lg border border-tg-hint/30 px-3 py-1 text-sm"
        >
          retry
        </button>
      </CenteredHint>
    );
  }
  if (profile.status === "missing") {
    if (role === "BUYER") {
      return (
        <BuyerProfileForm
          onSaved={() => {
            profile.refresh();
            onUserChanged();
          }}
        />
      );
    }
    return (
      <OwnerProfileForm
        onSaved={() => {
          profile.refresh();
          onUserChanged();
        }}
      />
    );
  }

  return (
    <Home user={user} profile={profile.data} onProfileUpdated={profile.refresh} />
  );
}

function Home({
  user,
  profile,
  onProfileUpdated,
}: {
  user: PublicUser;
  profile: MyProfileResponse;
  onProfileUpdated: () => void;
}) {
  const [tab, setTab] = useState<Tab>("discover");

  return (
    <div className="min-h-full flex flex-col">
      <div className="flex-1">
        {tab === "discover" && (
          <Deck onMatched={() => setTab("matches")} />
        )}
        {tab === "matches" && (
          <MatchesList
            onOpenChat={() => {
              // Phase 4 will open the chat view; for now stub: stay on matches.
            }}
          />
        )}
        {tab === "profile" && (
          <MyProfile user={user} profile={profile} onUpdated={onProfileUpdated} />
        )}
      </div>
      <Nav current={tab} onChange={setTab} />
    </div>
  );
}

function CenteredHint({
  text,
  children,
}: {
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="min-h-full flex flex-col items-center justify-center gap-2 p-6 text-center">
      {text && <p className="text-tg-hint text-sm">{text}</p>}
      {children}
    </main>
  );
}

function HealthDebug() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Health>("/health")
      .then(setHealth)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  return (
    <details className="fixed bottom-16 right-2 text-xs text-tg-hint">
      <summary>debug</summary>
      <pre className="bg-tg-secondary-bg p-2 rounded">
        {error ? `error: ${error}` : health ? JSON.stringify(health) : "checking…"}
      </pre>
    </details>
  );
}

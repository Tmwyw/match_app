import { Flame, MessagesSquare, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { MyProfileResponse, PublicUser, Role } from "@tg-app-meet/shared";
import { api } from "./api";
import { useAuth } from "./auth/useAuth";
import { Deck } from "./discover/Deck";
import { MatchesList } from "./matches/MatchesList";
import { RolePicker } from "./onboarding/RolePicker";
import { BuyerProfileForm } from "./profile/BuyerProfileForm";
import { MyProfile } from "./profile/MyProfile";
import { OwnerProfileForm } from "./profile/OwnerProfileForm";
import { useProfile } from "./profile/useProfile";
import { getTelegramWebApp } from "./telegram";
import { Button, CenteredMessage, TabBar, type TabItem } from "./ui";

type Tab = "discover" | "matches" | "profile";
type Health = { status: string; db: string; ts: string };

const TABS: readonly TabItem<Tab>[] = [
  { key: "discover", label: "Найти", icon: <Flame size={22} /> },
  { key: "matches", label: "Матчи", icon: <MessagesSquare size={22} /> },
  { key: "profile", label: "Профиль", icon: <UserRound size={22} /> },
];

export function App() {
  const auth = useAuth();

  useEffect(() => {
    const tg = getTelegramWebApp();
    tg?.ready();
    tg?.expand();
  }, []);

  if (auth.status === "loading") {
    return (
      <CenteredMessage>
        <p className="text-tg-hint text-sm">authenticating…</p>
      </CenteredMessage>
    );
  }
  if (auth.status === "needs-telegram") {
    return (
      <CenteredMessage>
        <p className="text-tg-hint text-sm">
          Open this page from inside Telegram to sign in.
        </p>
      </CenteredMessage>
    );
  }
  if (auth.status === "error") {
    return (
      <CenteredMessage>
        <p className="text-danger text-sm">auth failed: {auth.error}</p>
        <Button variant="secondary" size="md" onClick={auth.refresh} className="mt-2">
          retry
        </Button>
      </CenteredMessage>
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
    return (
      <CenteredMessage>
        <p className="text-tg-hint text-sm">загружаем профиль…</p>
      </CenteredMessage>
    );
  }
  if (profile.status === "error") {
    return (
      <CenteredMessage>
        <p className="text-danger text-sm">{profile.error}</p>
        <Button variant="secondary" size="md" onClick={profile.refresh} className="mt-2">
          retry
        </Button>
      </CenteredMessage>
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
      <div className="flex-1 pb-24">
        {tab === "discover" && (
          <Deck
            myRole={profile.role}
            onMatched={() => setTab("matches")}
          />
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
      <TabBar items={TABS} active={tab} onChange={setTab} />
    </div>
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
    <details className="fixed bottom-20 right-2 text-[10px] text-tg-hint z-30">
      <summary>debug</summary>
      <pre className="bg-card p-2 rounded text-[10px]">
        {error ? `error: ${error}` : health ? JSON.stringify(health) : "checking…"}
      </pre>
    </details>
  );
}

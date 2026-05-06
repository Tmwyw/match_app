import { Flame, MessagesSquare, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { MeResponse, MyProfileResponse, Role } from "@tg-app-meet/shared";
import { AdminScreen } from "./admin/AdminScreen";
import { api } from "./api";
import { useAuth } from "./auth/useAuth";
import { ChatScreen } from "./chat/ChatScreen";
import { Deck } from "./discover/Deck";
import { UserCardScreen } from "./discover/UserCardScreen";
import { MatchesList } from "./matches/MatchesList";
import { RolePicker } from "./onboarding/RolePicker";
import { BuyerProfileForm } from "./profile/BuyerProfileForm";
import { MyProfile } from "./profile/MyProfile";
import { OwnerProfileForm } from "./profile/OwnerProfileForm";
import { useProfile } from "./profile/useProfile";
import { getStartParam, getTelegramWebApp } from "./telegram";
import { Background, Button, CenteredMessage, TabBar, type TabItem } from "./ui";
import { useLikesCount } from "./useLikesCount";

export type OpenChat = {
  chatId: string;
  otherUserId: string;
  otherAnonId: string;
  otherDisplayName: string | null;
  otherRole: Role;
};

type Tab = "discover" | "matches" | "profile";

export function App() {
  // Admin override: opening /?admin=<ADMIN_TOKEN> short-circuits the whole
  // user flow into the operator console. We don't auth-redirect here — the
  // backend's AdminGuard verifies the token on every request.
  const adminToken = useMemo(() => {
    if (typeof window === "undefined") return null;
    const t = new URLSearchParams(window.location.search).get("admin");
    return t && t.length > 0 ? t : null;
  }, []);

  // Hooks must run unconditionally — call useAuth even in admin mode.
  const auth = useAuth();

  useEffect(() => {
    const tg = getTelegramWebApp();
    tg?.ready();
    tg?.expand();
  }, []);

  if (adminToken) {
    return <AdminScreen token={adminToken} />;
  }

  const content =
    auth.status === "loading" ? (
      <CenteredMessage>
        <p className="text-tg-hint text-sm">authenticating…</p>
      </CenteredMessage>
    ) : auth.status === "needs-telegram" ? (
      <CenteredMessage>
        <p className="text-tg-hint text-sm">
          Open this page from inside Telegram to sign in.
        </p>
      </CenteredMessage>
    ) : auth.status === "banned" ? (
      <CenteredMessage>
        <h1 className="text-2xl font-bold mb-2">Аккаунт заблокирован</h1>
        <p className="text-tg-hint text-sm max-w-xs">
          {auth.error
            ? `Причина: ${auth.error}`
            : "Доступ к приложению ограничен модерацией."}
        </p>
      </CenteredMessage>
    ) : auth.status === "deleted" ? (
      <CenteredMessage>
        <h1 className="text-2xl font-bold mb-2">Аккаунт удалён</h1>
        <p className="text-tg-hint text-sm max-w-xs">
          Этот аккаунт был удалён. Если это ошибка — напиши в поддержку.
        </p>
      </CenteredMessage>
    ) : auth.status === "error" ? (
      <CenteredMessage>
        <p className="text-danger text-sm">auth failed: {auth.error}</p>
        <Button variant="secondary" size="md" onClick={auth.refresh} className="mt-2">
          retry
        </Button>
      </CenteredMessage>
    ) : (
      <AuthedFlow
        user={auth.user}
        onUserChanged={auth.refresh}
        onAccountDeleted={auth.markDeleted}
      />
    );

  return (
    <>
      <Background />
      <div style={{ position: "relative", zIndex: 10, minHeight: "100%" }}>
        {content}
      </div>
    </>
  );
}

function AuthedFlow({
  user,
  onUserChanged,
  onAccountDeleted,
}: {
  user: MeResponse;
  onUserChanged: () => void;
  onAccountDeleted: () => void;
}) {
  if (!user.role) {
    return <RolePicker onDone={onUserChanged} />;
  }
  return (
    <ProfileFlow
      user={user}
      role={user.role}
      onUserChanged={onUserChanged}
      onAccountDeleted={onAccountDeleted}
    />
  );
}

function ProfileFlow({
  user,
  role,
  onUserChanged,
  onAccountDeleted,
}: {
  user: MeResponse;
  role: Role;
  onUserChanged: () => void;
  onAccountDeleted: () => void;
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
    <Home
      user={user}
      profile={profile.data}
      onProfileUpdated={profile.refresh}
      onAccountDeleted={onAccountDeleted}
      onRoleReset={() => {
        // Refresh both — server now has role=null, profile is gone.
        // AuthedFlow will swap us to RolePicker on the next render.
        profile.refresh();
        onUserChanged();
      }}
    />
  );
}

function Home({
  user,
  profile,
  onProfileUpdated,
  onAccountDeleted,
  onRoleReset,
}: {
  user: MeResponse;
  profile: MyProfileResponse;
  onProfileUpdated: () => void;
  onAccountDeleted: () => void;
  onRoleReset: () => void;
}) {
  const [tab, setTab] = useState<Tab>("discover");
  const [openChat, setOpenChat] = useState<OpenChat | null>(null);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const likes = useLikesCount();

  // Deep-link routing — runs once after onboarding/profile flow. We honour
  // both the bot-side `pendingViewProfile` (set when user tapped
  // ?start=p_<id>) and the SDK's `start_param` (set when Mini App was
  // launched via ?startapp=p_<id>). Either path opens the same overlay.
  useEffect(() => {
    const fromStart = getStartParam();
    const startTarget = fromStart?.startsWith("p_") ? fromStart.slice(2) : null;
    const target = startTarget ?? user.pendingViewProfile;
    if (!target || target === user.id) return;
    setViewingProfileId(target);
    if (user.pendingViewProfile) {
      // Clear server-side once consumed so reopening doesn't re-trigger.
      void api("/me/pending-view", { method: "DELETE" }).catch(() => {
        /* harmless */
      });
    }
    // Only react to the initial value — clearing setViewingProfileId(null)
    // shouldn't re-open the card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs: readonly TabItem<Tab>[] = useMemo(
    () => [
      { key: "discover", label: "Найти", icon: <Flame size={22} /> },
      {
        key: "matches",
        label: "Матчи",
        icon: <MessagesSquare size={22} />,
        badge: likes.count,
      },
      { key: "profile", label: "Профиль", icon: <UserRound size={22} /> },
    ],
    [likes.count],
  );

  return (
    <div className="min-h-full flex flex-col">
      <div className="flex-1 pb-24">
        {tab === "discover" && (
          <Deck
            myRole={profile.role}
            onMatched={(payload) => {
              setOpenChat(payload);
              setTab("matches");
            }}
          />
        )}
        {tab === "matches" && (
          <MatchesList
            onOpenChat={(payload) => setOpenChat(payload)}
            inboundLikesCount={likes.count}
          />
        )}
        {tab === "profile" && (
          <MyProfile
            user={user}
            profile={profile}
            onUpdated={onProfileUpdated}
            onAccountDeleted={onAccountDeleted}
            onRoleReset={onRoleReset}
          />
        )}
      </div>
      <TabBar items={tabs} active={tab} onChange={setTab} />
      {openChat && (
        <ChatScreen
          chatId={openChat.chatId}
          currentUser={user}
          otherUserId={openChat.otherUserId}
          otherAnonId={openChat.otherAnonId}
          otherDisplayName={openChat.otherDisplayName}
          otherRole={openChat.otherRole}
          onBack={() => setOpenChat(null)}
          onBlocked={() => setOpenChat(null)}
        />
      )}
      {viewingProfileId && (
        <UserCardScreen
          userId={viewingProfileId}
          myRole={profile.role}
          onClose={() => setViewingProfileId(null)}
          onMatched={(payload) => {
            setViewingProfileId(null);
            setOpenChat(payload);
            setTab("matches");
            likes.refresh();
          }}
        />
      )}
    </div>
  );
}

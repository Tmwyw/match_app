import { Flame, MessagesSquare, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { MyProfileResponse, PublicUser, Role } from "@tg-app-meet/shared";
import { AdminScreen } from "./admin/AdminScreen";
import { useAuth } from "./auth/useAuth";
import { ChatScreen } from "./chat/ChatScreen";
import { Deck } from "./discover/Deck";
import { MatchesList } from "./matches/MatchesList";
import { RolePicker } from "./onboarding/RolePicker";
import { BuyerProfileForm } from "./profile/BuyerProfileForm";
import { MyProfile } from "./profile/MyProfile";
import { OwnerProfileForm } from "./profile/OwnerProfileForm";
import { useProfile } from "./profile/useProfile";
import { getTelegramWebApp } from "./telegram";
import { Background, Button, CenteredMessage, TabBar, type TabItem } from "./ui";

export type OpenChat = {
  chatId: string;
  otherUserId: string;
  otherAnonId: string;
  otherRole: Role;
};

type Tab = "discover" | "matches" | "profile";

const TABS: readonly TabItem<Tab>[] = [
  { key: "discover", label: "Найти", icon: <Flame size={22} /> },
  { key: "matches", label: "Матчи", icon: <MessagesSquare size={22} /> },
  { key: "profile", label: "Профиль", icon: <UserRound size={22} /> },
];

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

  // Background sits at z:0 (not behind body bg). App content is wrapped in
  // a relative z-10 layer so it paints above the gradient. Without this
  // wrapper, Telegram's webview defaults can put its own bg between the
  // Background div and the rest of the tree.
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
  user: PublicUser;
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
  user: PublicUser;
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
    />
  );
}

function Home({
  user,
  profile,
  onProfileUpdated,
  onAccountDeleted,
}: {
  user: PublicUser;
  profile: MyProfileResponse;
  onProfileUpdated: () => void;
  onAccountDeleted: () => void;
}) {
  const [tab, setTab] = useState<Tab>("discover");
  const [openChat, setOpenChat] = useState<OpenChat | null>(null);

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
          <MatchesList onOpenChat={(payload) => setOpenChat(payload)} />
        )}
        {tab === "profile" && (
          <MyProfile
            user={user}
            profile={profile}
            onUpdated={onProfileUpdated}
            onAccountDeleted={onAccountDeleted}
          />
        )}
      </div>
      <TabBar items={TABS} active={tab} onChange={setTab} />
      {openChat && (
        <ChatScreen
          chatId={openChat.chatId}
          currentUser={user}
          otherUserId={openChat.otherUserId}
          otherAnonId={openChat.otherAnonId}
          otherRole={openChat.otherRole}
          onBack={() => setOpenChat(null)}
          onBlocked={() => {
            // Block triggered from menu — close the chat and let the user
            // pick the next match. The block is server-side enforced now,
            // so even if they navigate back the chat will 403.
            setOpenChat(null);
          }}
        />
      )}
    </div>
  );
}


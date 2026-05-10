import { Flame, MessagesSquare, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  MatchesListResponse,
  MeResponse,
  MyProfileResponse,
  Role,
} from "@tg-app-meet/shared";
import { AdminScreen } from "./admin/AdminScreen";
import { api } from "./api";
import { useAuth } from "./auth/useAuth";
import { ChatScreen } from "./chat/ChatScreen";
import { Deck } from "./discover/Deck";
import { UserCardScreen } from "./discover/UserCardScreen";
import { MatchesList } from "./matches/MatchesList";
import { ModerationPendingScreen } from "./onboarding/ModerationPendingScreen";
import { RolePicker } from "./onboarding/RolePicker";
import { BuyerProfileForm } from "./profile/BuyerProfileForm";
import { MyProfile } from "./profile/MyProfile";
import { OwnerProfileForm } from "./profile/OwnerProfileForm";
import { useProfile } from "./profile/useProfile";
import { getStartParam, getTelegramWebApp } from "./telegram";
import { Background, Button, CenteredMessage, Logo, TabBar, type TabItem } from "./ui";
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
    // Bot API 7.7+ — disable the Telegram-level "swipe-down to close
    // the Mini App" gesture. Without it the WebView is constantly
    // listening for vertical swipes, which on iOS in particular
    // partially steals horizontal touch frames from our card deck and
    // makes swipe-left / swipe-right feel laggy or under-registered.
    // Older clients silently ignore the call (method missing).
    try {
      tg?.disableVerticalSwipes?.();
    } catch {
      /* old client without the method — fine */
    }
  }, []);

  if (adminToken) {
    return <AdminScreen token={adminToken} />;
  }

  const content =
    auth.status === "loading" ? (
      <CenteredMessage>
        <Logo glow size={96} className="mb-4" />
        <p className="text-tg-hint text-sm">authenticating…</p>
      </CenteredMessage>
    ) : auth.status === "needs-telegram" ? (
      <CenteredMessage>
        <Logo glow size={96} className="mb-4" />
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
    const abortToRolePicker = async () => {
      // DELETE /onboarding/role only succeeds while no profile row exists,
      // which is exactly the state we're in here. After it returns, /me
      // has role=null and AuthedFlow re-renders into RolePicker.
      try {
        await api("/onboarding/role", { method: "DELETE" });
      } catch {
        /* swallow — onUserChanged will refetch and surface any real issue */
      }
      onUserChanged();
    };
    if (role === "BUYER") {
      return (
        <BuyerProfileForm
          onSaved={() => {
            profile.refresh();
            onUserChanged();
          }}
          onAbort={abortToRolePicker}
        />
      );
    }
    return (
      <OwnerProfileForm
        onSaved={() => {
          profile.refresh();
          onUserChanged();
        }}
        onAbort={abortToRolePicker}
      />
    );
  }

  // Profile-moderation gate. The user has a saved profile but admin
  // hasn't approved yet — hold them on a polling screen instead of
  // letting them into the deck (where /discover would 409 anyway).
  if (!user.profileApproved) {
    return <ModerationPendingScreen onCheckStatus={onUserChanged} />;
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
  user: MeResponse;
  profile: MyProfileResponse;
  onProfileUpdated: () => void;
  onAccountDeleted: () => void;
}) {
  const [tab, setTab] = useState<Tab>("discover");
  const [openChat, setOpenChat] = useState<OpenChat | null>(null);
  // `origin` decides whether the swipe action row shows up. When opened
  // from the chats list we already matched with this user, so showing
  // Like/Skip would be nonsensical — hideActions handles that.
  const [viewing, setViewing] = useState<{
    id: string;
    origin: "deep-link" | "chats";
  } | null>(null);
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
    setViewing({ id: target, origin: "deep-link" });
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

  // `?chat=<id>` deep link — auto-open that conversation. Set by
  // NotificationsService.send() so the inline "Открыть" button under
  // a message-push DM jumps the user straight into the right chat
  // instead of dropping them on the deck. Fetches /matches once,
  // looks up the chatId, and builds the OpenChat payload from there.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const chatId = new URLSearchParams(window.location.search).get("chat");
    if (!chatId) return;
    let aborted = false;
    void (async () => {
      try {
        const matches = await api<MatchesListResponse>(
          "/matches?archived=false",
        );
        if (aborted) return;
        const m = matches.find((row) => row.chatId === chatId);
        if (!m) return;
        setOpenChat({
          chatId: m.chatId,
          otherUserId: m.other.userId,
          otherAnonId: m.other.anonId,
          otherDisplayName: m.other.displayName,
          otherRole: m.other.role,
        });
        setTab("matches");
      } catch {
        /* fall through — user lands on default tab */
      }
    })();
    return () => {
      aborted = true;
    };
    // Only on first mount — clearing openChat shouldn't re-resolve the
    // URL param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs: readonly TabItem<Tab>[] = useMemo(
    () => [
      { key: "discover", label: "Поиск", icon: <Flame size={22} /> },
      {
        key: "matches",
        label: "Диалоги",
        icon: <MessagesSquare size={22} />,
        badge: likes.count,
      },
      { key: "profile", label: "Профиль", icon: <UserRound size={22} /> },
    ],
    [likes.count],
  );

  return (
    <div className="h-[100dvh] flex flex-col">
      {/* `h-[100dvh]` (vs min-h-full) gives the column a definite height —
          required so children with `h-full` resolve correctly (Discover
          locks itself to the viewport and would collapse to 0 otherwise).
          `flex flex-col` + `flex-1` on this wrapper makes the active tab
          content fill exactly (viewport - tabbar - safe-area). pb-24 keeps
          MatchesList/MyProfile scroll content above the tabbar visually. */}
      <div className="flex-1 min-h-0 pb-24 flex flex-col">
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
            onOpenProfile={(userId) =>
              setViewing({ id: userId, origin: "chats" })
            }
            inboundLikesCount={likes.count}
          />
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
      {viewing && (
        <UserCardScreen
          userId={viewing.id}
          myRole={profile.role}
          hideActions={viewing.origin === "chats"}
          onClose={() => setViewing(null)}
          onMatched={(payload) => {
            setViewing(null);
            setOpenChat(payload);
            setTab("matches");
            likes.refresh();
          }}
        />
      )}
    </div>
  );
}

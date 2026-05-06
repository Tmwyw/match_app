import { Banknote, Briefcase, Building2, Copy, Globe2, Pencil, Send, Settings, Sparkles, Target, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { MeResponse, MyProfileResponse, ReferralLinkResponse } from "@tg-app-meet/shared";
import { api } from "../api";
import { SettingsScreen } from "../settings/SettingsScreen";
import { shareLink } from "../telegram";
import { Button, Card, RoleAvatar, Screen } from "../ui";
import { BuyerProfileForm } from "./BuyerProfileForm";
import { OwnerProfileForm } from "./OwnerProfileForm";

type Props = {
  user: MeResponse;
  profile: MyProfileResponse;
  onUpdated: () => void;
  /** Called after the user soft-deletes their own account from /settings.
   *  App swaps to the "deleted" screen — no further auth round-trip. */
  onAccountDeleted: () => void;
  /** Called after the user resets their role from /settings — App refreshes
   *  /me; with role=null they fall back to RolePicker. */
  onRoleReset: () => void;
};

export function MyProfile({
  user,
  profile,
  onUpdated,
  onAccountDeleted,
  onRoleReset,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (editing) {
    if (profile.role === "BUYER") {
      return (
        <BuyerProfileForm
          initial={profile}
          onSaved={() => {
            setEditing(false);
            onUpdated();
          }}
          onCancel={() => setEditing(false)}
        />
      );
    }
    return (
      <OwnerProfileForm
        initial={profile}
        onSaved={() => {
          setEditing(false);
          onUpdated();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <Screen className="pb-safe min-h-screen">
      <div className="max-w-md mx-auto flex flex-col gap-4">
        <ProfileHero user={user} role={profile.role} />

        {profile.role === "BUYER" ? (
          <BuyerBody profile={profile} />
        ) : (
          <OwnerBody profile={profile} />
        )}

        <Button
          variant="secondary"
          fullWidth
          onClick={() => setEditing(true)}
          className="mt-2"
        >
          <Pencil size={16} />
          Редактировать
        </Button>

        <ReferralSection referralCount={user.referralCount} />

        <Button
          variant="ghost"
          fullWidth
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={16} />
          Настройки
        </Button>
      </div>
      {settingsOpen && (
        <SettingsScreen
          onClose={() => setSettingsOpen(false)}
          onDeleted={onAccountDeleted}
          onRoleReset={onRoleReset}
        />
      )}
    </Screen>
  );
}

function ReferralSection({ referralCount }: { referralCount: number }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    api<ReferralLinkResponse>("/me/referral-link")
      .then((r) => {
        if (!aborted) setLink(r.link);
      })
      .catch((e) => {
        if (!aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      aborted = true;
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      showToast("Скопировано");
    } catch {
      showToast("Не удалось скопировать");
    }
  };

  const share = () => {
    if (!link) return;
    shareLink(link, "Залетай в TG Meet — мэтчинг баеров и овнеров");
  };

  return (
    <Card className="flex flex-col gap-3 p-4 mt-2">
      <div className="flex items-start gap-3">
        <Users size={18} className="text-accent shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Пригласи друзей</div>
          <div className="text-[11px] text-tg-hint">
            {referralCount > 0
              ? `Ты пригласил ${referralCount} ${pluralPeople(referralCount)}.`
              : "Реферал привязывается, когда друг открывает приложение по твоей ссылке."}
          </div>
        </div>
      </div>
      {error && <p className="text-danger text-xs">{error}</p>}
      {link && (
        <div className="rounded-input bg-card-elevated border border-app-border px-3 py-2 text-xs text-tg-text break-all">
          {link}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="md" fullWidth onClick={copy} disabled={!link}>
          <Copy size={14} />
          Скопировать
        </Button>
        <Button variant="primary" size="md" fullWidth onClick={share} disabled={!link}>
          <Send size={14} />
          Поделиться
        </Button>
      </div>
      {toast && (
        <div className="text-[11px] text-tg-hint text-center">{toast}</div>
      )}
    </Card>
  );
}

function pluralPeople(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "человека";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "человека";
  return "человек";
}

function ProfileHero({
  user,
  role,
}: {
  user: MeResponse;
  role: "BUYER" | "OWNER";
}) {
  const tint =
    role === "BUYER"
      ? "from-role-buyer/30 via-transparent to-transparent"
      : "from-role-owner/30 via-transparent to-transparent";

  return (
    <Card className="relative overflow-hidden p-6">
      <div
        aria-hidden
        className={`absolute inset-0 bg-gradient-to-br ${tint} pointer-events-none`}
      />
      <div className="relative flex flex-col items-center text-center gap-3">
        <RoleAvatar role={role} size="xl" />
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {user.displayName ?? user.anonId}
          </h1>
          {user.displayName && user.anonId && (
            <p className="text-tg-hint text-[10px] uppercase tracking-wider mt-1">
              {user.anonId}
            </p>
          )}
          <p className="text-tg-hint text-xs mt-1.5">
            {user.username ? `@${user.username} · ` : ""}виден только тебе
          </p>
        </div>
      </div>
    </Card>
  );
}

function BuyerBody({
  profile,
}: {
  profile: Extract<MyProfileResponse, { role: "BUYER" }>;
}) {
  return (
    <Card className="flex flex-col gap-5 p-5">
      <Block icon={<Target size={16} />} label="Источники">
        <Tags items={profile.verticals} />
      </Block>
      <Divider />
      <Block icon={<Globe2 size={16} />} label="Гео">
        <Tags items={profile.geos} />
      </Block>
      <Divider />
      <Stats
        items={[
          {
            icon: <Banknote size={16} />,
            label: "бюджет",
            value: `$${profile.budgetMin.toLocaleString()}–${profile.budgetMax.toLocaleString()}`,
          },
          {
            icon: <Sparkles size={16} />,
            label: "опыт",
            value: `${profile.experience} лет`,
          },
        ]}
      />
      {profile.bio && (
        <>
          <Divider />
          <Block label="О себе">
            <p className="text-sm text-tg-text-secondary leading-relaxed">
              {profile.bio}
            </p>
          </Block>
        </>
      )}
    </Card>
  );
}

function OwnerBody({
  profile,
}: {
  profile: Extract<MyProfileResponse, { role: "OWNER" }>;
}) {
  return (
    <Card className="flex flex-col gap-5 p-5">
      <Block icon={<Building2 size={16} />} label="Оффер">
        <p className="text-base font-semibold text-tg-text">
          {profile.offerName}
        </p>
      </Block>
      <Divider />
      <Block icon={<Briefcase size={16} />} label="Вертикаль">
        <Tags items={[profile.vertical]} />
      </Block>
      <Divider />
      <Block icon={<Globe2 size={16} />} label="Гео">
        <Tags items={profile.geos} />
      </Block>
      <Divider />
      <Stats
        items={[
          {
            icon: <Banknote size={16} />,
            label: profile.payoutType,
            value: `$${profile.payoutAmount.toLocaleString()}`,
          },
        ]}
      />
      {profile.requirements && (
        <>
          <Divider />
          <Block label="Требования">
            <p className="text-sm text-tg-text-secondary leading-relaxed">
              {profile.requirements}
            </p>
          </Block>
        </>
      )}
      {profile.bio && (
        <>
          <Divider />
          <Block label="О себе">
            <p className="text-sm text-tg-text-secondary leading-relaxed">
              {profile.bio}
            </p>
          </Block>
        </>
      )}
    </Card>
  );
}

function Block({
  icon,
  label,
  children,
}: {
  icon?: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-tg-hint">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-app-border" />;
}

function Tags({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <span
          key={t}
          className="rounded-chip px-2.5 py-1 text-xs font-semibold bg-accent-muted text-tg-text border border-app-border"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function Stats({
  items,
}: {
  items: { icon: ReactNode; label: string; value: string }[];
}) {
  return (
    <div className={`grid gap-3 ${items.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-button bg-glass-elevated/40 border border-app-border px-3.5 py-3 flex flex-col gap-1"
        >
          <div className="flex items-center gap-1.5 text-tg-hint">
            {item.icon}
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              {item.label}
            </span>
          </div>
          <div className="text-lg font-bold text-tg-text">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

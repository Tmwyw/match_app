import { Banknote, Briefcase, Building2, Globe2, Pencil, Settings, Sparkles, Target } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { MyProfileResponse, PublicUser } from "@tg-app-meet/shared";
import { SettingsScreen } from "../settings/SettingsScreen";
import { Button, Card, RoleAvatar, Screen } from "../ui";
import { BuyerProfileForm } from "./BuyerProfileForm";
import { OwnerProfileForm } from "./OwnerProfileForm";

type Props = {
  user: PublicUser;
  profile: MyProfileResponse;
  onUpdated: () => void;
  /** Called after the user soft-deletes their own account from /settings.
   *  App swaps to the "deleted" screen — no further auth round-trip. */
  onAccountDeleted: () => void;
};

export function MyProfile({ user, profile, onUpdated, onAccountDeleted }: Props) {
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
        />
      )}
    </Screen>
  );
}

function ProfileHero({
  user,
  role,
}: {
  user: PublicUser;
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
            {user.anonId}
          </h1>
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

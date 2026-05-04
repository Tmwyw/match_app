import { Pencil } from "lucide-react";
import { useState } from "react";
import type { MyProfileResponse, PublicUser } from "@tg-app-meet/shared";
import { Button, Card, RoleAvatar, Screen } from "../ui";
import { BuyerProfileForm } from "./BuyerProfileForm";
import { OwnerProfileForm } from "./OwnerProfileForm";

type Props = {
  user: PublicUser;
  profile: MyProfileResponse;
  onUpdated: () => void;
};

export function MyProfile({ user, profile, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);

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
        <Header user={user} role={profile.role} />

        {profile.role === "BUYER" ? (
          <BuyerView profile={profile} />
        ) : (
          <OwnerView profile={profile} />
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
      </div>
    </Screen>
  );
}

function Header({
  user,
  role,
}: {
  user: PublicUser;
  role: "BUYER" | "OWNER";
}) {
  return (
    <Card className="flex flex-col items-center text-center gap-3 py-6">
      <RoleAvatar role={role} size="xl" />
      <div>
        <h1 className="text-2xl font-bold">{user.anonId}</h1>
        <p className="text-tg-hint text-xs mt-1">
          {user.username ? `@${user.username} · ` : ""}виден только тебе
        </p>
      </div>
    </Card>
  );
}

function BuyerView({
  profile,
}: {
  profile: Extract<MyProfileResponse, { role: "BUYER" }>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FieldCard label="Источники" value={profile.verticals.join(", ")} />
      <FieldCard label="Гео" value={profile.geos.join(", ")} />
      <FieldCard label="Бюджет" value={`$${profile.budgetMin}–${profile.budgetMax}`} />
      <FieldCard label="Опыт" value={`${profile.experience} лет`} />
      {profile.bio && <FieldCard label="О себе" value={profile.bio} />}
    </div>
  );
}

function OwnerView({
  profile,
}: {
  profile: Extract<MyProfileResponse, { role: "OWNER" }>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FieldCard label="Оффер" value={profile.offerName} />
      <FieldCard label="Вертикаль" value={profile.vertical} />
      <FieldCard label="Гео" value={profile.geos.join(", ")} />
      <FieldCard
        label="Выплаты"
        value={`${profile.payoutType} · $${profile.payoutAmount}`}
      />
      {profile.requirements && (
        <FieldCard label="Требования" value={profile.requirements} />
      )}
      {profile.bio && <FieldCard label="О себе" value={profile.bio} />}
    </div>
  );
}

function FieldCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-tg-hint">
        {label}
      </span>
      <span className="text-base break-words">{value}</span>
    </Card>
  );
}

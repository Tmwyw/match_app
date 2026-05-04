import { useState } from "react";
import type { MyProfileResponse, PublicUser } from "@tg-app-meet/shared";
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
    <main className="p-4 max-w-md mx-auto flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{user.anonId}</h1>
          {user.username && (
            <p className="text-tg-hint text-xs">@{user.username} · виден только тебе</p>
          )}
        </div>
        <button
          onClick={() => setEditing(true)}
          className="rounded-lg border border-tg-hint/30 px-3 py-1 text-sm"
        >
          Edit
        </button>
      </header>

      {profile.role === "BUYER" ? (
        <BuyerView profile={profile} />
      ) : (
        <OwnerView profile={profile} />
      )}
    </main>
  );
}

function BuyerView({ profile }: { profile: Extract<MyProfileResponse, { role: "BUYER" }> }) {
  return (
    <section className="flex flex-col gap-3">
      <Row label="Вертикали" value={profile.verticals.join(", ")} />
      <Row label="Гео" value={profile.geos.join(", ")} />
      <Row label="Бюджет" value={`$${profile.budgetMin}–${profile.budgetMax}`} />
      <Row label="Опыт" value={`${profile.experience} лет`} />
      {profile.bio && <Row label="О себе" value={profile.bio} />}
    </section>
  );
}

function OwnerView({ profile }: { profile: Extract<MyProfileResponse, { role: "OWNER" }> }) {
  return (
    <section className="flex flex-col gap-3">
      <Row label="Оффер" value={profile.offerName} />
      <Row label="Вертикаль" value={profile.vertical} />
      <Row label="Гео" value={profile.geos.join(", ")} />
      <Row label="Выплаты" value={`${profile.payoutType} · $${profile.payoutAmount}`} />
      {profile.requirements && <Row label="Требования" value={profile.requirements} />}
      {profile.bio && <Row label="О себе" value={profile.bio} />}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-tg-hint/30 bg-tg-secondary-bg p-3">
      <div className="text-tg-hint text-xs">{label}</div>
      <div className="text-sm mt-0.5 break-words">{value}</div>
    </div>
  );
}

import type { PublicCard } from "@tg-app-meet/shared";
import { Card, RoleAvatar } from "../ui";

/**
 * Read-only render of a PublicCard. Reused by Deck (active candidate)
 * and UserCardScreen (deep-link viewer). Does NOT include action buttons —
 * the caller composes those around the card.
 */
export function CardView({ card }: { card: PublicCard }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-center gap-3">
        <RoleAvatar role={card.role} size="lg" />
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-tg-hint">
            {card.role === "BUYER" ? "БАЕР" : "ОВНЕР"}
          </div>
          <h2 className="text-2xl font-bold">{card.displayName ?? card.anonId}</h2>
        </div>
      </header>
      {card.role === "BUYER" ? <BuyerBody card={card} /> : <OwnerBody card={card} />}
    </Card>
  );
}

function BuyerBody({ card }: { card: Extract<PublicCard, { role: "BUYER" }> }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <Row label="Источники" value={card.verticals.join(" · ")} />
      <Row label="Гео" value={card.geos.join(" · ")} />
      <Row label="Бюджет" value={`$${card.budgetMin}–${card.budgetMax}`} />
      <Row label="Опыт" value={`${card.experience} лет`} />
      {card.bio && <Row label="О себе" value={card.bio} />}
    </div>
  );
}

function OwnerBody({ card }: { card: Extract<PublicCard, { role: "OWNER" }> }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <Row label="Оффер" value={card.offerName} />
      <Row label="Вертикаль" value={card.vertical} />
      <Row label="Гео" value={card.geos.join(" · ")} />
      <Row
        label="Выплаты"
        value={
          card.payoutTypes.length > 0
            ? `${card.payoutTypes.join(" / ")} · $${card.payoutAmount}`
            : `$${card.payoutAmount}`
        }
      />
      {card.requirements && <Row label="Требования" value={card.requirements} />}
      {card.bio && <Row label="О себе" value={card.bio} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-tg-hint">
        {label}
      </div>
      <div className="break-words mt-0.5">{value}</div>
    </div>
  );
}

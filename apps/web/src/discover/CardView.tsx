import type { PublicCard } from "@tg-app-meet/shared";
import { Card, RoleAvatar } from "../ui";

/**
 * Read-only render of a PublicCard. Reused by Deck (active candidate)
 * and UserCardScreen (deep-link viewer). Does NOT include action buttons —
 * the caller composes those around the card.
 */
export function CardView({ card }: { card: PublicCard }) {
  return (
    <Card className="flex flex-col gap-4 p-5 h-full overflow-hidden">
      <header className="flex items-center gap-3 shrink-0">
        <RoleAvatar role={card.role} size="lg" />
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-tg-hint">
            {card.role === "BUYER" ? "БАЕР" : "ОВНЕР"}
          </div>
          <h2 className="text-2xl font-bold">{card.displayName ?? card.anonId}</h2>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {card.role === "BUYER" ? <BuyerBody card={card} /> : <OwnerBody card={card} />}
      </div>
    </Card>
  );
}

function BuyerBody({ card }: { card: Extract<PublicCard, { role: "BUYER" }> }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      {card.desiredPosition && (
        <Row label="Интересующая вакансия" value={card.desiredPosition} />
      )}
      <Row label="Источник трафика" value={card.trafficSources.join(" · ") || "—"} />
      {card.verticals.length > 0 && (
        <Row label="Вертикаль" value={card.verticals.join(" · ")} />
      )}
      <Row label="Гео" value={card.geos.join(" · ")} />
      <Row label="Желаемая зп" value={`$${card.budgetMin}–${card.budgetMax}`} />
      <Row label="Опыт" value={`${card.experience} лет`} />
      {card.notes && <Row label="Дополнительно" value={card.notes} />}
    </div>
  );
}

function OwnerBody({ card }: { card: Extract<PublicCard, { role: "OWNER" }> }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <Row label="Кто нужен в команду" value={card.offerName} />
      {card.bio && <Row label="О себе" value={card.bio} />}
      <Row label="Источник трафика" value={card.trafficSources.join(" · ") || "—"} />
      {card.verticals.length > 0 && (
        <Row label="Вертикаль" value={card.verticals.join(" · ")} />
      )}
      <Row label="Гео" value={card.geos.join(" · ")} />
      <Row
        label="Оплата"
        value={`$${card.payoutMin}–${card.payoutMax}`}
      />
      {card.requirements && <Row label="Дополнительно" value={card.requirements} />}
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

import { Heart } from "lucide-react";
import type { PublicCard } from "@tg-app-meet/shared";
import { Card, RoleAvatar } from "../ui";

/**
 * Read-only render of a PublicCard. Reused by Deck (active candidate)
 * and UserCardScreen (deep-link viewer). Does NOT include action buttons —
 * the caller composes those around the card.
 */
export function CardView({ card }: { card: PublicCard }) {
  return (
    <Card className="relative flex flex-col gap-4 p-5 h-full overflow-hidden">
      {card.likedYou && <LikedYouBadge />}
      <header className="flex items-center gap-3 shrink-0">
        <RoleAvatar role={card.role} size="lg" />
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-tg-hint">
            {card.role === "BUYER" ? "БАЕР" : "ОВНЕР"}
          </div>
          <h2 className="text-2xl font-bold">{card.displayName ?? card.anonId}</h2>
        </div>
      </header>
      {/* `touch-pan-y` (touch-action: pan-y) explicitly tells Android
          and iOS that touches starting here are for vertical scroll
          ONLY — horizontal touches bubble up to the framer-motion drag
          handler on the card wrapper. Without this, mobile WebViews
          arbitrate the gesture and sometimes claim the touch for their
          own (no-op) horizontal scroll, dropping frames in our drag.
          `overscroll-contain` blocks scroll-chaining so reaching the
          top/bottom doesn't bubble to the document. */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y -mx-1 px-1">
        {card.role === "BUYER" ? <BuyerBody card={card} /> : <OwnerBody card={card} />}
      </div>
    </Card>
  );
}

/**
 * "Liked you" pill — surfaces in the top-right corner of the card. The
 * pink/red palette and pulse animation are intentionally distinct from
 * the (red/green) swipe-direction glow so it reads at a glance: this is
 * about "they already swiped on you", not "you're swiping right now".
 */
function LikedYouBadge() {
  return (
    <div className="absolute top-3 right-3 z-20 pointer-events-none">
      <div className="flex items-center gap-1.5 rounded-full px-3 py-1 bg-pink-500/15 border border-pink-400/60 backdrop-blur-sm shadow-[0_0_18px_rgba(244,114,182,0.55)] animate-pulse">
        <Heart size={13} className="text-pink-400" fill="currentColor" />
        <span className="text-[11px] font-bold tracking-wide text-pink-300 uppercase">
          Лайкнул вас
        </span>
      </div>
    </div>
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

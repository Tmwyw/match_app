import { Clock } from "lucide-react";
import { useEffect } from "react";
import { Button, CenteredMessage, Logo } from "../ui";

type Props = {
  /** Triggered by the polling effect AND the manual refresh button. The
   *  parent (App.tsx AuthedFlow) refetches /me; once `profileApproved`
   *  becomes true the parent routes away from this screen. */
  onCheckStatus: () => void;
};

/**
 * Holding screen rendered between profile-submission and admin approval.
 * Polls /me every 30s and on tab focus so the user lands on the deck
 * automatically once admin approves — no manual refresh needed (though
 * we surface a button anyway for impatient users).
 */
export function ModerationPendingScreen({ onCheckStatus }: Props) {
  useEffect(() => {
    const id = window.setInterval(onCheckStatus, 30_000);
    const onFocus = () => onCheckStatus();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [onCheckStatus]);

  return (
    <CenteredMessage>
      <Logo glow size={96} className="mb-4" />
      <div className="flex items-center gap-2 mb-2">
        <Clock size={18} className="text-accent" />
        <h1 className="text-xl font-bold">Заявка на модерации</h1>
      </div>
      <p className="text-tg-hint text-sm max-w-xs">
        Ваша анкета отправлена на модерацию. Мы пришлём уведомление в
        Telegram, как только админ её одобрит. После этого вы сможете
        приступить к поиску.
      </p>
      <Button
        variant="secondary"
        size="md"
        onClick={onCheckStatus}
        className="mt-4"
      >
        Проверить статус
      </Button>
    </CenteredMessage>
  );
}

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

type TelegramWebApp = {
  initData: string;
  initDataUnsafe: { user?: TelegramUser };
  ready: () => void;
  expand: () => void;
  colorScheme: "light" | "dark";
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function getTelegramUser(): TelegramUser | null {
  return getTelegramWebApp()?.initDataUnsafe.user ?? null;
}

/**
 * Open a Telegram resource (user profile, channel, link) inside the Telegram
 * client. Use the SDK's `openTelegramLink` when available — `<a href="tg://...">`
 * is unreliable across Telegram clients (Desktop in particular blocks it).
 * Falls back to `https://t.me/...` in a regular browser.
 */
export function openTelegramUsername(username: string): void {
  const tg = getTelegramWebApp();
  const url = `https://t.me/${username}`;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
    return;
  }
  // Browser fallback (dev / non-Telegram context).
  window.open(url, "_blank", "noopener,noreferrer");
}

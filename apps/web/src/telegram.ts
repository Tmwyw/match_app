type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

type TelegramWebApp = {
  initData: string;
  initDataUnsafe: { user?: TelegramUser; start_param?: string };
  ready: () => void;
  expand: () => void;
  colorScheme: "light" | "dark";
  /** Bot API version string ("7.7", "8.0", …). Lets us feature-test
   *  newer methods like disableVerticalSwipes which only exist on
   *  Telegram clients that ship the matching API version. */
  version?: string;
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  /** Available on iOS/Android Telegram 7.0+. Web has it too. */
  shareToStory?: (mediaUrl: string, params?: { text?: string }) => void;
  /** Bot API 7.7+. Disables Telegram's system "swipe-down to close
   *  the Mini App" gesture. Critical for our card-deck swipe — without
   *  this the WebView listens for vertical swipes and partially steals
   *  the horizontal touch on some clients (iOS in particular). */
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  isVerticalSwipesEnabled?: boolean;
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred?: (type: "error" | "success" | "warning") => void;
  };
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

/** Returns the `?startapp=PAYLOAD` value when the Mini App was launched
 *  from a deep link, or null otherwise. Used for `p_<userId>` previews. */
export function getStartParam(): string | null {
  const raw = getTelegramWebApp()?.initDataUnsafe.start_param;
  return raw && raw.length > 0 ? raw : null;
}

/** Native Telegram share sheet — falls back to opening t.me/share/url
 *  in a regular browser when the SDK helper isn't available. */
export function shareLink(url: string, text: string): void {
  const tg = getTelegramWebApp();
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
    return;
  }
  window.open(shareUrl, "_blank", "noopener,noreferrer");
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

import { useEffect, useState } from "react";

/**
 * Light/dark theme. Default is light — set as the brand "main" look.
 * Choice persists across reloads via localStorage.
 *
 * The palette swap itself happens via CSS: every Tailwind colour utility
 * we use ultimately resolves to a CSS var (see styles.css and
 * tailwind.config.js), and `<html data-theme="dark">` triggers the
 * dark-mode block. Toggling this attribute flips every consumer at once.
 */

export type Theme = "light" | "dark";
const STORAGE_KEY = "creo:theme";

/** Read persisted choice, defaulting to light. SSR-safe (returns "light"
 *  if window is missing — we never SSR but be defensive). */
export function readTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "dark" ? "dark" : "light";
  } catch {
    // Telegram webviews occasionally throw on localStorage access — fall
    // through to the default rather than crashing the boot path.
    return "light";
  }
}

/** Apply the theme to the live document by setting / removing
 *  `data-theme` on <html>. Default (light) leaves the attribute absent. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

/** Hook for consumers that want both the current value and a setter
 *  that persists. */
export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  const setTheme = (next: Theme): void => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage unavailable — selection won't persist but the
         current session still flips. */
    }
    applyTheme(next);
    setThemeState(next);
  };

  // Defensive: if applyTheme wasn't called pre-render (e.g. devtools
  // hot-reloaded the entry), make sure DOM matches state.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return [theme, setTheme];
}

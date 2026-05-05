import { useCallback, useEffect, useState } from "react";

/**
 * `useState` backed by localStorage, with safe fallbacks for Telegram
 * webviews that silently no-op storage. The state still works in-memory
 * even when persistence fails — read CLAUDE.md for context on why.
 */
export function useLocalStorageState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* webview may block — in-memory state still works */
    }
  }, [key, state]);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState((prev) => (typeof next === "function" ? (next as (p: T) => T)(prev) : next));
  }, []);

  return [state, set];
}

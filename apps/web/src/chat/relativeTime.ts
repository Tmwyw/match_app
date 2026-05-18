/**
 * Russian relative-time for "был N мин назад"-style copy. Buckets:
 *   < 60s         → "только что"
 *   < 60m         → "N мин назад"
 *   < 24h         → "N ч назад"
 *   < 7d          → "N дн назад"
 *   ≥ 7d          → "давно"
 *
 * Pluralisation handled with a small ru-rule so we don't drag a full
 * Intl.PluralRules table in for three buckets.
 */
export function relativeRu(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "был давно";
  const t = new Date(iso).getTime();
  const diffMs = now - t;
  if (diffMs < 0) return "только что";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "был только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `был ${min} ${ruPlural(min, "минуту", "минуты", "минут")} назад`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `был ${hr} ${ruPlural(hr, "час", "часа", "часов")} назад`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `был ${day} ${ruPlural(day, "день", "дня", "дней")} назад`;
  return "был давно";
}

function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/**
 * Compact relative-time for the Telegram-style chat-list rows. Buckets:
 *   today (same calendar day, < 24h)  → "HH:MM" (e.g. "18:45")
 *   yesterday                          → "вч"
 *   < 7 days                           → ru weekday short ("пн" / "вт" / …)
 *   else                               → "DD.MM"
 *
 * Returns "" if the timestamp is null so callers can render nothing
 * without a separate null-check around the JSX.
 */
export function shortChatTime(
  iso: string | null,
  now: Date = new Date(),
): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  if (isSameDay(t, now)) {
    return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(t, yesterday)) return "вч";
  const diffDays = Math.floor((now.getTime() - t.getTime()) / 86_400_000);
  if (diffDays < 7 && diffDays > 0) {
    return WEEKDAYS_RU[t.getDay()] ?? "";
  }
  return `${pad(t.getDate())}.${pad(t.getMonth() + 1)}`;
}

const WEEKDAYS_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

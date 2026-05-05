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

export type FilterResult = { content: string; filtered: boolean };

export const REPLACEMENT = "[скрыто]";

// ─── Normalisation primitives ─────────────────────────────────────────────

/** Zero-width chars + bidirectional embedding marks bypass-typers paste
 *  inside handles to break strict regex `[a-zA-Z0-9_]+` runs. */
const ZERO_WIDTH = /[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\u00AD]/gu;

/**
 * Separators a deanon-bypasser sticks BETWEEN characters of a handle to
 * defeat strict regex matching. We strip these only inside the "compressed"
 * form used for second-pass detection — never on the visible text the user
 * actually sent.
 *
 * Whitespace is intentionally NOT in this set: stripping single spaces
 * would join unrelated tokens (`@ab кончилось` → `@abkoh…`) and trip the
 * compressed @-handle detector. The "spaced-out handle" bypass is caught
 * by a dedicated visible pattern instead (see SPACED_HANDLE).
 */
const SEPARATORS = /[.\-_·•・･,;:|\\<>()]+/gu;

/**
 * Cyrillic letters that visually pass for Latin. Turning these into ASCII
 * before pattern matching catches `@dуrov` (cyr 'у'), `@оffer` (cyr 'о'),
 * `arbi.bуer.com` etc. The map is one-way for detection only — we don't
 * mutate the user's actual message back; we just check whether the
 * latinised copy matches a pattern.
 */
const HOMOGLYPHS: Record<string, string> = {
  а: "a", А: "a", в: "b", В: "b", е: "e", Е: "e", ё: "e", Ё: "e",
  з: "3", З: "3", і: "i", І: "i", й: "i", Й: "i", к: "k", К: "k",
  л: "l", Л: "l", м: "m", М: "m", н: "h", Н: "h", о: "o", О: "o",
  п: "n", П: "n", р: "p", Р: "p", с: "c", С: "c", т: "t", Т: "t",
  у: "y", У: "y", х: "x", Х: "x", ѕ: "s", Ѕ: "s", ј: "j", Ј: "j",
  ԛ: "q", "ⅼ": "l",
};

function latinize(text: string): string {
  return text.replace(/./gu, (c) => HOMOGLYPHS[c] ?? c);
}

function normalize(text: string): string {
  // NFKC collapses full-width ＠ＡＢＣ → @ABC and similar compatibility forms.
  return text.normalize("NFKC").replace(ZERO_WIDTH, "");
}

/**
 * Detection-only canonical form: NFKC + ZW strip + cyrillic→latin + lowercase
 * + drop separators. `@d.у r·o.v` becomes `@durov`, `t · me / foo` becomes
 * `tme/foo`, `+7 (999) 1·2·3 4 5 6 7` becomes `+79991234567`.
 */
function compress(text: string): string {
  return latinize(normalize(text)).toLowerCase().replace(SEPARATORS, "");
}

// ─── Visible-pass patterns (run on normalised but human-readable text) ───

const VISIBLE_PATTERNS: RegExp[] = [
  // Telegram links — accept dot, middle-dot, bullet, dash, or space between
  // the host parts (`t·me`, `t-me`, `t me`, `t.me`).
  /(?:https?:\/\/)?(?:t|telegram)\s*[.·•・\-]?\s*me\s*\/\s*[\p{L}\p{N}_+\-]+/giu,
  // Other contact platforms with the same flexibility on the dot.
  /(?:https?:\/\/)?(?:wa|m|fb|x|twitter|youtu|vk|ok)\s*[.·•・\-]?\s*(?:me|com|be|ru)\s*\/\s*[\p{L}\p{N}_.\-+]+/giu,
  // Generic URLs — broad TLD list. Unicode-aware host so cyrillic IDNs match too.
  /(?:https?:\/\/)?(?:www\s*\.\s*)?[\p{L}\p{N}\-]+\s*\.\s*(?:com|ru|org|io|net|me|app|xyz|cc|tg|dev|co|pro|ua|by|kz|info|biz|site|club|online|store|space|live|tech|wtf)\b[^\s]*/giu,
  // Email — Unicode local-part and domain so `я@почта.рф` is caught.
  /[\p{L}\p{N}._%+\-]+@[\p{L}\p{N}.\-]+\.[\p{L}]{2,}/giu,
  // @-handles — 3+ chars including cyrillic/digits (down from the previous
  // 4-char threshold; reports + bans soak up false positives).
  /@[\p{L}\p{N}_]{3,}/giu,
  // Spaced-out handle bypass: `@ d u r o v` — 4+ single alphanumeric chars
  // each separated by whitespace, after a `@`. Distinct from `@ab кончилось`
  // (where `ab` is a single token, not separated chars).
  /@\s+[\p{L}\p{N}_](?:\s+[\p{L}\p{N}_]){3,}/giu,
  // Phones — 7+ digits with optional pluses/parens/separators between.
  /\+?\d[\d\s\-().·•]{5,}\d/gu,
];

// ─── Platform-keyword detector — catches "пиши в тг arbi_pro" etc ────────
//
// JavaScript `\b` only treats `[A-Za-z0-9_]` as word chars (even with /u),
// so it doesn't fire correctly around cyrillic alternatives like `тг`.
// Roll our own Unicode-aware boundaries via lookarounds.

const NB_BEFORE = "(?<![\\p{L}\\p{N}_])";
const NB_AFTER = "(?![\\p{L}\\p{N}_])";
const platform = (kw: string, tail: string) =>
  new RegExp(`${NB_BEFORE}(?:${kw})${NB_AFTER}${tail}`, "giu");

const PLATFORM_KEYWORDS: RegExp[] = [
  platform("telegram|телеграм|телега|tg|тг|тгшк[ао]", "\\s*[-–—:.,]?\\s*@?[\\p{L}\\p{N}_.+\\-]{3,}"),
  platform("whatsapp|wa|вотс|вотсап|вац", "\\s*[-–—:.,]?\\s*@?[+\\p{L}\\p{N}_.+\\-]{3,}"),
  platform("instagram|инстаграм|инста|insta|ig", "\\s*[-–—:.,]?\\s*@?[\\p{L}\\p{N}_.\\-]{3,}"),
  platform("discord|дискорд|disc", "\\s*[-–—:.,]?\\s*[@#]?[\\p{L}\\p{N}_.#\\-]{3,}"),
  platform("viber|вайбер|skype|скайп|signal|сигнал", "\\s*[-–—:.,]?\\s*[@+]?[\\p{L}\\p{N}_.+\\-]{3,}"),
  platform("facebook|фейсбук|фб|fb|twitter|твиттер|твиттр", "\\s*[-–—:.,]?\\s*@?[\\p{L}\\p{N}_.\\-]{3,}"),
  // "пиши/напиши/связь/контакт + handle" — broader natural-language catch.
  platform("пиши|напиши|пишите|стучи|связь|контакт|контакты|конт", "[^.\\n]{0,30}@[\\p{L}\\p{N}_.\\-]{3,}"),
];

// ─── Compressed-pass patterns (run on `compress(input)`) ─────────────────

const COMPRESSED_PATTERNS: RegExp[] = [
  /@[a-z0-9_]{4,}/g,            // @durov / @ d u r o v / @dуrov / @ｄｕｒｏｖ
  /(?:t|telegram)me\/[a-z0-9_]+/g, // t.me/foo / telegram.me/foo / t·me/foo
  /(?:wa|m|fb)me\/[a-z0-9_+]+/g,   // wa.me/+7..., m.me/foo
  /\+?\d{7,}/g,                  // 7+ continuous digits regardless of separators
];

// ─── Public API ──────────────────────────────────────────────────────────

export function antiDeanon(input: string): FilterResult {
  const normalized = normalize(input);
  let content = normalized;
  let filtered = false;

  // Pass 1: keyword + handle/url/phone patterns on normalised but readable text.
  // Order matters — platform keywords run first so they consume `пиши в тг foo`
  // as one chunk before the bare `foo` later passes the @-handle regex.
  for (const re of [...PLATFORM_KEYWORDS, ...VISIBLE_PATTERNS]) {
    const before = content;
    content = content.replace(re, REPLACEMENT);
    if (content !== before) filtered = true;
  }

  // Pass 2: bypass detection. Compress separators + map cyrillic homoglyphs
  // on the POST-PASS-1 text. If a handle/url/phone pattern still matches
  // here, the leak survived Pass 1 — meaning the user used unicode tricks
  // (cyrillic homoglyphs, ZW chars, separator-stuffing) to get past the
  // visible patterns. We can't surgically replace the matching span in
  // the original (compress changes positions), so wholesale-scrub.
  const compressedAfter = compress(content);
  for (const re of COMPRESSED_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(compressedAfter)) {
      filtered = true;
      content = REPLACEMENT;
      break;
    }
  }

  return { content: content.trim(), filtered };
}

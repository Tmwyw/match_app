export type FilterResult = { content: string; filtered: boolean };

const REPLACEMENT = "[скрыто]";

const PATTERNS: RegExp[] = [
  /(?:https?:\/\/)?(?:t|telegram)\.me\/[a-zA-Z0-9_+/?=&%.\-]+/gi,
  /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.(?:com|ru|org|io|net|me|app|xyz|cc|tg|dev|co|pro)\b[^\s]*/gi,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /@[a-zA-Z0-9_]{4,}/g,
  /\+?\d[\d\s\-()]{7,}\d/g,
];

export function antiDeanon(input: string): FilterResult {
  let filtered = false;
  let content = input;
  for (const re of PATTERNS) {
    const before = content;
    content = content.replace(re, REPLACEMENT);
    if (content !== before) filtered = true;
  }
  return { content: content.trim(), filtered };
}

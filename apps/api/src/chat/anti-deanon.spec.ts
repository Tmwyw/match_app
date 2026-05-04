import { describe, expect, it } from "vitest";
import { antiDeanon } from "./anti-deanon";

describe("antiDeanon", () => {
  it("passes clean text untouched", () => {
    const r = antiDeanon("Привет! Расскажи про оффер, какие гео и условия?");
    expect(r.filtered).toBe(false);
    expect(r.content).toBe("Привет! Расскажи про оффер, какие гео и условия?");
  });

  it("scrubs @username", () => {
    const r = antiDeanon("Я @durov, пиши мне");
    expect(r.filtered).toBe(true);
    expect(r.content).toBe("Я [скрыто], пиши мне");
  });

  it("ignores tiny @ab handle (too short to be a real Telegram username)", () => {
    const r = antiDeanon("слово@ab кончилось");
    expect(r.filtered).toBe(false);
    expect(r.content).toContain("@ab");
  });

  it("scrubs t.me link", () => {
    const r = antiDeanon("Кидай в t.me/durov");
    expect(r.filtered).toBe(true);
    expect(r.content).toBe("Кидай в [скрыто]");
  });

  it("scrubs telegram.me with https", () => {
    const r = antiDeanon("Зайди https://telegram.me/foo_bar тут");
    expect(r.filtered).toBe(true);
    expect(r.content).toContain("[скрыто]");
    expect(r.content).not.toContain("telegram.me");
  });

  it("scrubs generic url", () => {
    const r = antiDeanon("Сайт example.com и партнёрка my-cool-shop.app");
    expect(r.filtered).toBe(true);
    expect(r.content).not.toContain("example.com");
    expect(r.content).not.toContain("cool-shop.app");
  });

  it("scrubs phone number with spaces and plus", () => {
    const r = antiDeanon("Звони +7 999 123 45 67 после обеда");
    expect(r.filtered).toBe(true);
    expect(r.content).toBe("Звони [скрыто] после обеда");
  });

  it("scrubs phone with parens and dashes", () => {
    const r = antiDeanon("(495) 123-45-67 наш номер");
    expect(r.filtered).toBe(true);
    expect(r.content).toContain("[скрыто]");
  });

  it("scrubs e-mail", () => {
    const r = antiDeanon("Пиши на foo.bar+spam@example.io по делу");
    expect(r.filtered).toBe(true);
    expect(r.content).not.toContain("@example.io");
  });

  it("scrubs all triggers in one message", () => {
    const r = antiDeanon(
      "Я @durov, пиши на t.me/durov или +7 999 1234567 или my@mail.com",
    );
    expect(r.filtered).toBe(true);
    expect(r.content).not.toContain("@durov");
    expect(r.content).not.toContain("t.me");
    expect(r.content).not.toContain("999");
    expect(r.content).not.toContain("@mail.com");
  });

  it("ignores standalone numbers shorter than phone-length", () => {
    const r = antiDeanon("заплатил 50 баксов");
    expect(r.filtered).toBe(false);
  });

  it("preserves text around scrubbed parts", () => {
    const r = antiDeanon("До @durov и после");
    expect(r.content.startsWith("До")).toBe(true);
    expect(r.content.endsWith("после")).toBe(true);
  });

  it("trims trailing whitespace after substitution", () => {
    const r = antiDeanon("@durov ");
    expect(r.content).toBe("[скрыто]");
  });
});

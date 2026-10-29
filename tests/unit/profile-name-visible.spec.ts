import { test, expect } from "@playwright/test";
import { checkName } from "@/lib/auth/profile-policy";

// A name has to show something. One made only of characters that take no room on the screen (zero-width spaces and joiners, the word joiner, the byte-order mark, a
// variation selector, the soft hyphen, the Arabic letter mark, fillers) is blank in every list that prints it, so it is refused like an empty one. Joiners between letters
// stay welcome: Persian, Arabic and Indic scripts and emoji sequences need them.

const INVISIBLE = [
  "\u200b", // zero-width space
  "\u200c", // zero-width non-joiner
  "\u200d", // zero-width joiner
  "\u2060", // word joiner
  "\ufeff", // byte-order mark
  "\u00ad", // soft hyphen
  "\u061c", // Arabic letter mark
  "\ufe0f", // variation selector 16
  "\u180e", // Mongolian vowel separator
  "\u3164", // Hangul filler
];

test.describe("checkName and names that show nothing", () => {
  test("a name of only invisible characters, alone, repeated, or with spaces between, is refused like an empty one", () => {
    for (const ch of INVISIBLE) {
      for (const input of [ch, ch.repeat(5), `${ch} ${ch}`, ` ${ch}  `]) {
        const result = checkName(input);
        expect(result.ok, JSON.stringify(input)).toBe(false);
        if (!result.ok) expect(result.message).toMatch(/enter your name/i);
      }
    }
    const mixed = checkName(INVISIBLE.join(" "));
    expect(mixed.ok).toBe(false);
  });

  test("a name with a visible character is accepted whatever invisible ones surround it", () => {
    for (const ch of INVISIBLE) {
      const result = checkName(`${ch}Amina${ch} Yusuf${ch}`);
      expect(result.ok, JSON.stringify(ch)).toBe(true);
    }
    expect(checkName("\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645").ok).toBe(true); // a Persian word with a non-joiner inside
    expect(checkName("\ud83d\udc69\u200d\ud83c\udfeb").ok).toBe(true); // an emoji sequence with a joiner inside
  });
});

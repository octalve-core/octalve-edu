import bidiFactory, { type Bidi } from "bidi-js";

// What a text needs before it can be drawn with embedded fonts (task 0045), pure: which font each character is drawn with, and in what order the pieces go on the line. Shaping (joining
// letters, placing marks) is the font library's job (unicode-fonts.ts); this file only decides the runs.
//
// A string is cut into runs of one font and one direction. The direction of each character comes from the Unicode Bidirectional Algorithm (`bidi-js`); the runs are then put in visual order
// (rule L2, applied to whole runs: a run is never reversed inside, because the shaper returns a right-to-left run already in visual order).

export type Script = "sans" | "naskh";
export type Run = { text: string; script: Script; level: number };

/// Letters and marks of the Arabic script (Arabic, Supplement, Extended-A, Presentation Forms A and B): drawn with Noto Naskh Arabic.
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
/// Characters that take the font of the letter before them: combining marks and the joiners.
const FOLLOWS = /[\u0300-\u036F\u0483-\u0489\u200C\u200D]/u;
/// Invisible direction controls and the byte-order mark: they steer the algorithm and are never drawn.
const NOT_DRAWN = /[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/u;
const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

let bidi: Bidi | null = null;
const algorithm = (): Bidi => (bidi ??= bidiFactory());

export const hasArabic = (text: string): boolean => ARABIC.test(text);

/// Text as it is measured and drawn: composed (NFC), tabs and line ends as spaces.
export const drawable = (text: string): string => text.normalize("NFC").replace(/[\t\n\r]/g, " ");

/// Runs in the order they stand on the line, left to right, and whether any of the line reads right to left.
export function visualRuns(input: string): { runs: Run[]; rtl: boolean } {
  const text = drawable(input);
  const { levels, paragraphs } = algorithm().getEmbeddingLevels(text);
  const items: { ch: string; script: Script; level: number }[] = [];
  let unit = 0;
  let previous: Script = "sans";
  for (const ch of text) {
    const level = levels[unit] ?? 0;
    unit += ch.length;
    if (NOT_DRAWN.test(ch)) continue;
    // A bracket read right to left is drawn as its mirror.
    const shown = level % 2 === 1 ? (algorithm().getMirroredCharacter(ch) ?? ch) : ch;
    // A letter or number takes the font of its script; a mark, a joiner and a space or punctuation take the font of the character before.
    const script: Script = ARABIC.test(ch) ? "naskh" : FOLLOWS.test(ch) || !LETTER_OR_NUMBER.test(ch) ? previous : "sans";
    previous = script;
    items.push({ ch: shown, script, level });
  }
  const runs: Run[] = [];
  for (const item of items) {
    const last = runs[runs.length - 1];
    if (last && last.script === item.script && last.level === item.level) last.text += item.ch;
    else runs.push({ text: item.ch, script: item.script, level: item.level });
  }
  const rtl = (paragraphs[0]?.level ?? 0) % 2 === 1 || runs.some((r) => r.level % 2 === 1);
  return { runs: reorder(runs), rtl };
}

/// Rule L2 on runs: from the highest level down to the lowest odd one, every sequence of runs at that level or above is reversed.
export function reorder(runs: readonly Run[]): Run[] {
  const out = [...runs];
  const highest = Math.max(0, ...out.map((r) => r.level));
  const odd = out.filter((r) => r.level % 2 === 1).map((r) => r.level);
  if (odd.length === 0) return out;
  for (let level = highest; level >= Math.min(...odd); level--) {
    let i = 0;
    while (i < out.length) {
      if (out[i].level < level) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < out.length && out[j + 1].level >= level) j++;
      const slice = out.slice(i, j + 1).reverse();
      out.splice(i, slice.length, ...slice);
      i = j + 1;
    }
  }
  return out;
}

/// The grapheme clusters of a text (a letter with its marks is one): where a name may be cut without leaving a mark alone.
export function clusters(text: string): string[] {
  const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
  return [...segmenter.segment(text)].map((s) => s.segment);
}

/// A text as UTF-16BE hexadecimal, the form a PDF's `ActualText` and `ToUnicode` use.
export function utf16Hex(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) out += text.charCodeAt(i).toString(16).padStart(4, "0");
  return out.toUpperCase();
}

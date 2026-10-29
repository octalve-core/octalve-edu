// "Is this the same question as one we already have?" Overlap method v1: one pure function over text, no database, no extension and no external service, so it can be replaced by a
// better method without touching anything that calls it (design note section 16 left the exact method open; this is the one proposed in the slice 2 plan).
//
// Every PART of a question (the prompt, and each option on its own) is folded to plain lower-case words and cut into overlapping runs of three words ("shingles"); the question is
// the SET of its shingles, each tagged with where it came from (prompt or option) so a prompt word and an option word are never confused. Two questions are compared by the Jaccard
// similarity of their sets: the shingles they share over all the shingles either has. Because options are a set, putting them in another order changes nothing. A score of
// OVERLAP_THRESHOLD or more means "the same question, give or take a word or two".
//
// What it is not: a paraphrase detector. A question reworded by hand scores low (the unit spec asserts that, so nobody mistakes this for more than it is), and two questions that
// differ only in their numbers score 0 because they ARE different questions.
//
// Bounded: only the first MAX_CHARS characters of each part and the first MAX_OPTIONS options are looked at, so the work for any input is bounded.

export const OVERLAP_THRESHOLD = 0.8;
const SHINGLE_WORDS = 3;
const MAX_CHARS = 20_000;
const MAX_OPTIONS = 50;

export type OverlapInput = { prompt: string; options?: readonly string[] };

const APOSTROPHES = /['‘’ʼ`´]/g;
// zero-width characters, bidi controls, the soft hyphen and the byte-order mark: invisible, so they must neither split a word nor hide one
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2069\u00ad\ufeff]/g;

/// A text as the words that count: letters and digits only, lower case, accents and other combining marks removed (Arabic diacritics too), full-width forms made ordinary,
/// apostrophes dropped (so "don't" and "dont" are one word), and the Arabic variants that people type interchangeably folded together: the forms of alef, alef maqsura and
/// ya, ta marbuta and ha, tatweel (stretching), and the Arabic-Indic and Persian digits made ASCII.
export function overlapTokens(text: string): string[] {
  const folded = text
    .slice(0, MAX_CHARS)
    .normalize("NFKD")
    .toLowerCase()
    .replace(INVISIBLE, "")
    .replace(APOSTROPHES, "")
    .replace(/\p{M}/gu, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  return folded.match(/[\p{L}\p{N}]+/gu) ?? [];
}

function addShingles(tag: string, tokens: readonly string[], into: Set<string>): void {
  if (tokens.length === 0) return;
  const size = Math.min(SHINGLE_WORDS, tokens.length); // a part of fewer than three words is one shingle of all its words
  for (let i = 0; i + size <= tokens.length; i++) into.add(`${tag}|${tokens.slice(i, i + size).join(" ")}`);
}

/// The shingle set of a question, for comparing it with many others without folding it again each time.
export function overlapProfile(question: OverlapInput): ReadonlySet<string> {
  const set = new Set<string>();
  addShingles("p", overlapTokens(question.prompt), set);
  for (const option of (question.options ?? []).slice(0, MAX_OPTIONS)) addShingles("o", overlapTokens(option), set);
  return set;
}

/// Shared over all, 0 when either has nothing to compare (two empty questions are not "the same").
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const item of small) if (large.has(item)) shared++;
  return shared / (a.size + b.size - shared);
}

/// 0 to 1, symmetric: 1 for the same question, 0 for nothing in common (or nothing to compare).
export const overlapScore = (a: OverlapInput, b: OverlapInput): number => jaccard(overlapProfile(a), overlapProfile(b));

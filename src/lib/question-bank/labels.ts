// The one place that decides what two class or subject names have in common in the question bank.
//
// A bank item's class and subject tags are TEXT, not foreign keys (the maintainer's decision of 2026-10-19, design note 16a): a ClassGroup or Subject row belongs to ONE
// branch, while a general item belongs to all of them. So a tag stores the label as typed AND a key, and a branch's class matches a tag when
// `normalizeLabel(ClassGroup.name)` equals the tag's key. Keeping the typed label next to the key means these rules can be improved later and every key recomputed
// without losing what the teacher wrote.
//
// The rule is plain on purpose: it removes what carries no meaning (case, spaces, hyphens, dots, underscores, punctuation, control and zero-width characters) and
// unifies how a digit is written. It does NOT guess that "Junior Secondary 1" means "JSS 1"; names that still do not match are the known weakness, and the screens say
// which of the viewer's classes a tag matches (and when it matches none).
//
// An empty result means nothing meaningful was left; callers must refuse an empty key.

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0; // the Persian and Urdu digits

/// Arabic-Indic (U+0660..0669) and Persian (U+06F0..06F9) digits to ASCII. Full-width digits are already folded by NFKC.
const toAsciiDigits = (text: string) =>
  text.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code - (code >= EXTENDED_ARABIC_INDIC_ZERO ? EXTENDED_ARABIC_INDIC_ZERO : ARABIC_INDIC_ZERO));
  });

/// Letters and digits of any script survive; everything else (separators, punctuation, symbols, marks, control and format characters, a lone surrogate) is removed.
/// Marks go too: lower-casing "İ" leaves an "i" plus a combining dot, and Arabic vowel signs are not part of a class name.
const NOT_LETTER_OR_DIGIT = /[^\p{L}\p{N}]/gu;

export function normalizeLabel(label: unknown): string {
  if (typeof label !== "string") return "";
  // NFKC, lower-case, NFKC again: lower-casing can produce a sequence that is not in normal form, and a stored key must be recomputable from itself (idempotent).
  const folded = toAsciiDigits(label.normalize("NFKC").toLowerCase().normalize("NFKC"));
  return folded.replace(NOT_LETTER_OR_DIGIT, "");
}

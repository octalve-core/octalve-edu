// The code that proves a published mark: 32 lower-case hexadecimal characters, printed on the report card as the end of its verification link.

export const VERIFY_CODE = /^[0-9a-f]{32}$/;

/// What a person typed or pasted into the "check a mark" box, as a code: the code itself, or the whole verification link (or anything that ends with the code, as pasted text
/// often does). Surrounding spaces and a different letter case do not matter; `null` when there is no code in it.
export function parseVerifyCode(input: string): string | null {
  const text = input.trim().toLowerCase();
  if (VERIFY_CODE.test(text)) return text;
  const fromLink = /\/verify\/([0-9a-f]{32})\/?(?:[?#].*)?$/.exec(text);
  return fromLink ? fromLink[1] : null;
}

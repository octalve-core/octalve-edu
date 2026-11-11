// The code that proves a published mark or an issued certificate: 32 lower-case hexadecimal characters, printed as the end of its verification link.

export const VERIFY_CODE = /^[0-9a-f]{32}$/;

/// What a person typed or pasted into the "check a code" box, as a code: the code itself, or the whole verification link (or anything that ends with the code, as pasted text
/// often does). The raw API addresses that earlier printed cards and certificates carry (`/api/v1/verify/<code>`, `/api/v1/verify-certificate/<code>`) are read too. Surrounding spaces
/// and a different letter case do not matter; `null` when there is no code in it, or when anything but a query or a fragment follows it.
export function parseVerifyCode(input: string): string | null {
  const text = input.trim().toLowerCase();
  if (VERIFY_CODE.test(text)) return text;
  const fromLink = /\/(?:api\/v1\/)?verify(?:-certificate)?\/([0-9a-f]{32})\/?(?:[?#].*)?$/.exec(text);
  return fromLink ? fromLink[1] : null;
}

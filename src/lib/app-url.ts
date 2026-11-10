// The address this deployment is served from, for a link that is PRINTED or saved (a report card's verification links): it must be a full address, because the reader
// of a printed page has no browser to complete a relative one.

const ORIGIN = /^https?:\/\/[^\s/?#]+(?:\/[^\s?#]*)?$/;
const clean = (text: string | undefined) => (text ?? "").trim().replace(/\/+$/, "");

/// `APP_URL` (the deployment's own setting, the one the sign-in cookie and the e-mails already use), else `fallback` (the address the request came in on), else the local
/// development address. Always `http(s)://host[:port][/path]` with no trailing slash.
export function appOrigin(fallback?: string): string {
  for (const candidate of [clean(process.env.APP_URL), clean(fallback)]) if (ORIGIN.test(candidate)) return candidate;
  return "http://localhost:3000";
}

/// The page where anyone can check a published mark by the code printed on the report card.
export const verifyPageUrl = (origin: string) => `${origin}/verify`;
export const verifyLink = (origin: string, code: string) => `${origin}/verify/${code}`;

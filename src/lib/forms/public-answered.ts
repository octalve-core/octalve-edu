import type { NextResponse } from "next/server";
import { isValidTenantCode } from "@/lib/tenant/validate-code";

// A public questionnaire cannot know who is answering, so it cannot stop one person answering twice. What it can do is ask each BROWSER to answer once: after an answer is stored the
// response sets a cookie that says "this browser answered this questionnaire", and the next answer from that browser is refused with a sentence. This is a courtesy, not a guarantee:
// anyone can clear the cookie, use another browser or another device, and the page says so. It holds NO identity (the cookie is a constant, not an id), so an anonymous questionnaire
// stays anonymous, and it is scoped by Path to this one questionnaire's address, so the browser sends it nowhere else and a person who has answered ten questionnaires carries ten
// cookies only to their own routes.

const SHARE_TOKEN = /^[0-9a-f]{32}$/;
const NAME = "qa";
const YEAR = 60 * 60 * 24 * 365;

export const ALREADY_ANSWERED_HERE = "You have already answered this questionnaire from this browser.";

/// Whether this browser has answered (the request carries this questionnaire's cookie). A token of another shape never matches.
export function answeredHere(req: Request, token: string): boolean {
  if (!SHARE_TOKEN.test(token)) return false;
  const header = req.headers.get("cookie") ?? "";
  return header.split(";").some((part) => part.trim() === `${NAME}=1`);
}

/// Marks this browser as having answered. `secure` follows the deployment's scheme, as the sign-in cookie does (a plain-HTTP install would otherwise never receive it). The school code and
/// the token go into the cookie's Path, so both are checked first and a value of another shape sets nothing.
export function markAnsweredHere<T extends NextResponse>(res: T, code: string, token: string): T {
  if (!SHARE_TOKEN.test(token) || !isValidTenantCode(code)) return res;
  res.cookies.set(NAME, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: `/api/v1/schools/${code}/forms/public/${token}`,
    maxAge: YEAR,
  });
  return res;
}

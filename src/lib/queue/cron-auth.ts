import { createHash, timingSafeEqual } from "node:crypto";

// The credential of the dispatch route (task 0057). The route is called by a scheduler, never by a person: no session, no school. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when
// a CRON_SECRET environment variable is set, and so can any other scheduler. This is a pure function so that it can be tested to the character.

/// A secret shorter than this is not a secret (Vercel recommends at least 16 random characters), and the route refuses to run on one.
export const CRON_SECRET_MIN_LENGTH = 16;

export type CronAuthorization =
  /// the header carries the secret
  | "ok"
  /// there is no usable secret on this server: the route must refuse EVERYONE, whatever they send (fail closed)
  | "not-configured"
  /// a secret is set and the caller did not present it
  | "denied";

/// Compares the `Authorization` header with the secret. Both sides are hashed first, so the comparison takes the same time whatever their lengths and wherever they differ.
export function checkCronAuthorization(header: string | null | undefined, secret: string | undefined): CronAuthorization {
  if (!secret || secret.length < CRON_SECRET_MIN_LENGTH) return "not-configured";
  // The scheme exactly as Vercel sends it, and nothing around the token: "bearer x", " Bearer x" and "Bearer x " are not what a scheduler sends.
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return "denied";
  const presented = createHash("sha256").update(header.slice("Bearer ".length)).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(presented, expected) ? "ok" : "denied";
}

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

export const BCRYPT_COST = 12;

/// bcrypt silently truncates its input at 72 BYTES, so a longer passphrase
/// loses entropy with no warning, and an unbounded field is an oversized-
/// payload DoS surface. One shared cap, imported by every Zod schema that
/// accepts a password (login, setup wizard, and future signup/reset).
export const PASSWORD_MAX_LENGTH = 128;

// A real bcrypt hash of an unguessed, never-used value, generated once at
// module load (boot) at the real production cost factor. It makes every
// login-failure path run bcrypt.compare exactly once whether or not a user
// matched — closing a timing side-channel where a missing-user response that
// skips bcrypt is measurably faster than a wrong-password response, even when
// both return the identical error. A malformed placeholder (not a real
// bcrypt hash) would make compare return instantly and defeat the fix, so
// this is a genuine hash, never a hardcoded string.
const DUMMY_HASH = bcrypt.hashSync(randomUUID(), BCRYPT_COST);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/// Always runs bcrypt.compare — against DUMMY_HASH when `hash` is null (no
/// such user, or an invited-but-not-yet-activated account with no
/// passwordHash) — so every branch costs the same.
export function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  return bcrypt.compare(password, hash ?? DUMMY_HASH);
}

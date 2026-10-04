// Password size limits, in a module with NO Node-only imports so the same
// numbers can drive both the server-side Zod schemas and the client-side form
// feedback (importing password.ts into a client component would drag bcrypt in).

/// Upper bound on the length of any password INPUT we are asked to look at —
/// login included. An unbounded field is an oversized-payload DoS surface
/// (bcrypt work is bounded, but request parsing and rate-limit key sizes aren't).
/// This is a size bound, not a strength rule.
export const PASSWORD_MAX_LENGTH = 128;

/// bcrypt only ever reads the first 72 BYTES of its input; anything past that
/// is silently ignored. So a NEW password (setup, and later signup / change /
/// reset) longer than this must be REJECTED, not truncated: otherwise a user
/// who picks a 100-character passphrase believes all 100 characters protect the
/// account while only the first 72 bytes do — and a typo after byte 72 still
/// signs them in. (bytes, not characters: emoji and most non-Latin letters take
/// 2-4 bytes each.)
///
/// Login deliberately does NOT enforce this: it must keep accepting whatever an
/// existing account's password was set to (bcrypt truncates identically at
/// verify time), so tightening login could lock a real user out.
export const PASSWORD_MAX_BYTES = 72;

export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

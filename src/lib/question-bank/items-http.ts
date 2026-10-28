import { Role } from "@prisma/client";
import { fail } from "@/lib/api/envelope";
import type { Fail } from "@/lib/question-bank/items-common";

// The HTTP face of the item services (task 0024 slice C): who may call at the door, and how a failure is answered.

/// The roles that may reach the question bank routes at all. What a person may then do with a particular question is decided inside, by `rules.ts`: a reviewer may be
/// non-teaching staff, so all four staff roles come in. Pupils and parents never do.
export const BANK_STAFF_ROLES = [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF];

/// A failure as a response. A validation failure carries its field problems.
export function failure(result: Fail | (Fail & { details?: { path: string; message: string }[] })) {
  const details = "details" in result ? result.details : undefined;
  return fail(
    result.message,
    result.status,
    result.code,
    details?.map((d) => ({ path: d.path, message: d.message })),
  );
}

/// An id from the URL path that cannot be an id is the same 404 as one that does not exist (a NUL byte would be a database error, not a missing row).
export const badId = (id: string) => (/^[A-Za-z0-9_-]{1,64}$/.test(id) ? null : fail("Not found", 404, "NOT_FOUND"));

import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api/envelope";
import type { Result } from "./common";

/// Who may reach a program route at all. Every role that can hold a place in a program (the school's administrator, a campus administrator, a program admin who is a member of staff). What a
/// person may do in THIS program is decided by the service (`access.ts`, read at every request: 404 for a program they have no place in, 403 for one they may read but not change), so the
/// roles here are a first door and never the guard.
export const PROGRAM_ROLES = [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF];

/// A service result as the standard envelope.
export function respond<T>(result: Result<T>, status = 200) {
  return result.ok ? ok(result.data, {}, status) : fail(result.message, result.status, result.code, result.details);
}

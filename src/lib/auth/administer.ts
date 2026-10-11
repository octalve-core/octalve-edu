import type { Role } from "@prisma/client";

// Who may ADMINISTER (write) something that belongs to a campus, or to the whole school (campusId = null) — plan C3, ADR 0016.
// A pure function, so its whole truth table is unit-tested. `withAuth` only says "a role was listed"; for a CAMPUS_ADMIN that is not enough,
// so a route that writes a row of a campus (or a school-wide row) asks this as well.
//
//   ADMIN         → always (school-wide; their own campusId is bookkeeping)
//   CAMPUS_ADMIN  → only a row of THEIR campus; a school-wide row (campusId null) is refused
//   anyone else   → never (staff, students and parents do not administer)

export type Administrator = { role: Role; campusId: string | null };

export function canAdminister(holder: Administrator, campusId: string | null): boolean {
  if (holder.role === "ADMIN") return true;
  if (holder.role === "CAMPUS_ADMIN") return holder.campusId !== null && campusId !== null && holder.campusId === campusId;
  return false;
}

/// True for the two roles that administer something (a school or a campus). Used where the question is "may this person see the admin
/// screens", not "may they touch this row".
export const isAdministrator = (role: Role): boolean => role === "ADMIN" || role === "CAMPUS_ADMIN";

import { fail } from "@/lib/api/envelope";
import type { TenantAuthContext } from "@/lib/auth/with-auth";

// Route-level answers to "may THIS member change THIS row?" for a CAMPUS_ADMIN (plan C3/C4, ADR 0016). `withAuth({ roles })` only says a role was
// listed; for a campus administrator the row's campus decides. An ADMIN is school-wide, so every helper returns at once for them — no lookup, no
// cost, and no change in behaviour for any school that has no campus administrator.
//
// The answers (the same everywhere):
//   • a row of ANOTHER campus, or one that does not exist  → 404 "No such …" (one answer: it must not confirm the row exists)
//   • a SCHOOL-WIDE row (campusId null), which they may SEE but not change → 403 FORBIDDEN
//   • a row of THEIR campus → null (allowed; the caller goes on)
//   • any role that does not administer → 403 (these helpers sit behind a `roles` list that already excludes them; this is the backstop)
//
// A route that writes a row calls one of these BEFORE the service, and the route-role guard test (tests/unit/route-role-guard.spec.ts) fails a
// campus-capable route that does not.

type Auth = TenantAuthContext;
type Tx = Parameters<Auth["tenant"]["run"]>[0] extends (tx: infer T) => unknown ? T : never;

const notFound = (what: string) => fail(`No such ${what}.`, 404, "NOT_FOUND");
const forbidden = () => fail("That belongs to the whole school. Only a school administrator can change it.", 403, "FORBIDDEN");

/// `campusId`: the row's campus, `null` for a school-wide row, `undefined` when there is no such row (or it is not visible).
export function judgeCampus(auth: Auth, campusId: string | null | undefined, what: string): Response | null {
  const { role, campusId: own } = auth.tenant;
  if (role === "ADMIN") return null;
  if (role !== "CAMPUS_ADMIN") return forbidden();
  if (campusId === undefined) return notFound(what);
  if (campusId === null) return forbidden();
  return campusId === own && own !== null ? null : notFound(what);
}

/// Runs `look` (a tenant-scoped read returning the row's campus, null for school-wide, undefined when absent) only for a non-ADMIN.
async function lookup(auth: Auth, what: string, look: (tx: Tx) => Promise<string | null | undefined>): Promise<Response | null> {
  if (auth.tenant.role === "ADMIN") return null;
  return judgeCampus(auth, await auth.tenant.run(look), what);
}

/// A new row's campus: an ADMIN's request is taken as it is; a campus administrator's defaults to THEIR campus, and naming any other campus
/// (or none — a school-wide row) is a 403. Returns the campus to use, or the refusal.
export function createCampus(auth: Auth, requested: string | null | undefined): { campusId: string | null } | Response {
  if (auth.tenant.role === "ADMIN") return { campusId: requested ?? null };
  if (auth.tenant.role !== "CAMPUS_ADMIN" || auth.tenant.campusId === null) return forbidden();
  if (requested === undefined || requested === auth.tenant.campusId) return { campusId: auth.tenant.campusId };
  return forbidden();
}

/// A campus named in a request (a filter, a target): the campus administrator's own only.
export const ownCampusOnly = (auth: Auth, campusId: string | null | undefined): Response | null =>
  auth.tenant.role === "ADMIN" || campusId === undefined || campusId === null || campusId === auth.tenant.campusId ? null : forbidden();

// --- one helper per kind of row -------------------------------------------------------------------------------------------------------

export const studentScope = (auth: Auth, id: string) =>
  lookup(auth, "student", async (tx) => (await tx.studentRecord.findFirst({ where: { id }, select: { campusId: true } }))?.campusId);

export const staffScope = (auth: Auth, id: string) =>
  lookup(auth, "staff record", async (tx) => (await tx.staffRecord.findFirst({ where: { id }, select: { campusId: true } }))?.campusId);

/// A guardian has no campus of their own: they are the campus's when a live link names a student of THAT campus. One who is linked only to other
/// campuses' students (or to no one) is "no such guardian" to a campus administrator.
export async function guardianScope(auth: Auth, id: string): Promise<Response | null> {
  if (auth.tenant.role === "ADMIN") return null;
  const own = auth.tenant.campusId;
  const linked = await auth.tenant.run((tx) =>
    tx.guardianLink.findFirst({
      where: { guardianId: id, status: { not: "REVOKED" }, student: { campusId: own } },
      select: { id: true },
    }),
  );
  return judgeCampus(auth, linked && own ? own : undefined, "guardian");
}

export const sessionScope = (auth: Auth, id: string) =>
  lookup(auth, "session", async (tx) => (await tx.academicSession.findFirst({ where: { id }, select: { campusId: true } }))?.campusId);

export const periodScope = (auth: Auth, id: string) =>
  lookup(
    auth,
    "period",
    async (tx) =>
      (await tx.academicPeriod.findFirst({ where: { id }, select: { session: { select: { campusId: true } } } }))?.session.campusId,
  );

export const classGroupScope = (auth: Auth, id: string) =>
  lookup(auth, "class", async (tx) => (await tx.classGroup.findFirst({ where: { id }, select: { campusId: true } }))?.campusId);

export const armScope = (auth: Auth, id: string) =>
  lookup(
    auth,
    "class arm",
    async (tx) =>
      (await tx.classArm.findFirst({ where: { id }, select: { classGroup: { select: { campusId: true } } } }))?.classGroup.campusId,
  );

/// Reading a student's record-adjacent data (an attendance history): their campus's students and the school-wide ones; another campus's is the usual 404.
export const studentReadScope = (auth: Auth, id: string) =>
  lookup(auth, "student", async (tx) => {
    const row = await tx.studentRecord.findFirst({ where: { id }, select: { campusId: true } });
    return row ? (row.campusId ?? auth.tenant.campusId) : undefined;
  });

/// Reading an arm (a roll call): the campus administrator's own and the school-wide ones; another campus's, or an unknown id, is the usual 404.
export const armReadScope = (auth: Auth, id: string) =>
  lookup(auth, "class arm", async (tx) => {
    const row = await tx.classArm.findFirst({ where: { id }, select: { classGroup: { select: { campusId: true } } } });
    return row ? (row.classGroup.campusId ?? auth.tenant.campusId) : undefined;
  });

export const announcementScope = (auth: Auth, id: string) =>
  lookup(auth, "announcement", async (tx) => (await tx.announcement.findFirst({ where: { id }, select: { campusId: true } }))?.campusId);

export const timetableSlotScope = (auth: Auth, id: string) =>
  lookup(auth, "timetable slot", async (tx) => {
    const slot = await tx.timetableSlot.findFirst({
      where: { id },
      select: { classArm: { select: { classGroup: { select: { campusId: true } } } } },
    });
    return slot?.classArm.classGroup.campusId;
  });

/// A certificate belongs to its student's campus: a campus administrator changes those of their own campus's students, those of a school-wide student
/// are the school administrator's (403), another campus's and an unknown id are the usual 404.
export const certificateScope = (auth: Auth, id: string) =>
  lookup(auth, "certificate", async (tx) => {
    const row = await tx.certificate.findFirst({ where: { id }, select: { student: { select: { campusId: true } } } });
    return row?.student.campusId;
  });

/// An invoice belongs to its student's campus. Money records are not "visible but off-limits": the invoice of a student with NO campus is the school
/// administrator's alone, so to a campus administrator it is "no such invoice" (404), not the 403 other school-wide rows get.
export const invoiceScope = (auth: Auth, id: string) =>
  lookup(auth, "invoice", async (tx) => {
    const row = await tx.invoice.findFirst({ where: { id }, select: { student: { select: { campusId: true } } } });
    return row?.student.campusId ?? undefined;
  });

/// The audience a CAMPUS_ADMIN may put on an announcement: their own campus (the default on create; naming any other, or the whole school, is a 403)
/// and, if a class arm is named, an arm of that campus. Other roles pass through unchanged — teachers keep the audience rules they had, and an ADMIN
/// is school-wide. On `update` an omitted campus stays as it is.
export async function announcementAudience(
  auth: Auth,
  input: { campusId?: string | null; classArmId?: string | null },
  mode: "create" | "update",
): Promise<{ campusId: string | null | undefined } | Response> {
  if (auth.tenant.role !== "CAMPUS_ADMIN") return { campusId: input.campusId };
  let campusId: string | null | undefined;
  if (mode === "create" || input.campusId !== undefined) {
    const campus = createCampus(auth, input.campusId);
    if (campus instanceof Response) return campus;
    campusId = campus.campusId;
  }
  if (input.classArmId) {
    const refused = await armScope(auth, input.classArmId);
    if (refused) return refused;
  }
  return { campusId };
}

/// Every class arm in `ids` (duplicates and null/undefined are ignored) must be the campus administrator's; the first refusal is returned.
export async function armsScope(auth: Auth, ids: readonly (string | null | undefined)[]): Promise<Response | null> {
  for (const id of new Set(ids.filter((x): x is string => Boolean(x)))) {
    const refused = await armScope(auth, id);
    if (refused) return refused;
  }
  return null;
}

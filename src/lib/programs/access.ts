import { ProgramStaffRole, ProgramStaffStatus, Role } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";

// Who may see and change a program (task 0027, design 2 points 3 and 4). Read at every request from the live data: an ended program admin, a deactivated membership or a campus the program no
// longer runs in loses the authority at once, with nothing to clean up. A program the person has no place in is "not found", exactly like one that does not exist.

/// SUPER: the school's administrator. ADMIN: a program admin (named by the school's administrator, holding an active staff membership whose campus is empty or one the program runs in).
/// CAMPUS: the administrator of a campus the program runs in - they read the program and (from slice P2) manage their own campus's people, never its structure.
export type ProgramViewer = { level: "SUPER" } | { level: "ADMIN" } | { level: "CAMPUS"; campusId: string };

export const canManage = (viewer: ProgramViewer): boolean => viewer.level === "SUPER" || viewer.level === "ADMIN";

/// The roles of a membership that can carry a program role (a pupil's or a guardian's membership cannot).
export const STAFF_ROLES: readonly Role[] = [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF];

type Auth = Pick<TenantAuthContext, "userId" | "tenant">;

/// Does a membership at `membershipCampusId` count in a program that runs in `programCampusIds`? A school-wide program (no campus) takes anyone; otherwise the person's campus is empty
/// (the whole school) or one the program runs in.
export const placeFits = (programCampusIds: readonly string[], membershipCampusId: string | null): boolean =>
  programCampusIds.length === 0 || membershipCampusId === null || programCampusIds.includes(membershipCampusId);

/// The program admin places a person holds that are live: the place is active and the membership behind it is an active staff one.
const liveAdminPlaces = (tx: Tx, tenantId: string, userId: string, programId?: string) =>
  tx.programStaff.findMany({
    where: {
      tenantId,
      userId,
      ...(programId ? { programId } : {}),
      role: ProgramStaffRole.ADMIN,
      status: ProgramStaffStatus.ACTIVE,
      membership: { deactivatedAt: null, role: { in: [...STAFF_ROLES] } },
    },
    select: { programId: true, membership: { select: { campusId: true } } },
  });

export async function viewerOf(auth: Auth, tx: Tx, programId: string): Promise<ProgramViewer | null> {
  const { tenantId, role, campusId } = auth.tenant;
  const program = await tx.program.findFirst({ where: { tenantId, id: programId }, select: { campuses: { select: { campusId: true } } } });
  if (!program) return null;
  if (role === Role.ADMIN) return { level: "SUPER" };
  const linked = program.campuses.map((row) => row.campusId);
  const places = await liveAdminPlaces(tx, tenantId, auth.userId, programId);
  if (places.some((place) => placeFits(linked, place.membership.campusId))) return { level: "ADMIN" };
  if (role === Role.CAMPUS_ADMIN && campusId !== null && linked.includes(campusId)) return { level: "CAMPUS", campusId };
  return null;
}

/// For each program the person can see, how: as the school's administrator (everything), as a program admin, or as the administrator of a campus it runs in. A program admin who is also a
/// campus administrator counts as a program admin (the wider of the two).
export async function levelsOf(auth: Auth, tx: Tx): Promise<{ superAdmin: boolean; admin: Set<string>; campus: Set<string> }> {
  const { tenantId, role, campusId } = auth.tenant;
  if (role === Role.ADMIN) return { superAdmin: true, admin: new Set(), campus: new Set() };
  const places = await liveAdminPlaces(tx, tenantId, auth.userId);
  const placeIds = [...new Set(places.map((place) => place.programId))];
  const runsIn = placeIds.length
    ? await tx.programCampus.findMany({ where: { tenantId, programId: { in: placeIds } }, select: { programId: true, campusId: true } })
    : [];
  const campusesOf = (programId: string) => runsIn.filter((row) => row.programId === programId).map((row) => row.campusId);
  const admin = new Set(
    places.filter((place) => placeFits(campusesOf(place.programId), place.membership.campusId)).map((place) => place.programId),
  );
  const viaCampus =
    role === Role.CAMPUS_ADMIN && campusId !== null
      ? await tx.programCampus.findMany({ where: { tenantId, campusId }, select: { programId: true } })
      : [];
  const campus = new Set(viaCampus.map((row) => row.programId).filter((id) => !admin.has(id)));
  return { superAdmin: false, admin, campus };
}

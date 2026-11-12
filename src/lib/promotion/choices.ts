// The session and calendar rules of a promotion, as pure functions with NO imports: the promotion screen runs them in the browser, and a module that imports `@prisma/client` brings the
// Prisma runtime into the page (which the page's Content-Security-Policy refuses: it evaluates code). The rest of the rules (rules.ts) re-export these for the server.

export interface SessionChoice {
  id: string;
  startDate: string | Date;
  status?: string;
  campusId?: string | null;
}

const startOf = (s: { startDate: string | Date }) => new Date(s.startDate).getTime();

/** The id of the session that begins right after the given one, in the same calendar, or "" when there is none (the next session has to be created first). */
export function sessionAfter(sessions: readonly SessionChoice[], id: string): string {
  const here = sessions.find((s) => s.id === id);
  if (!here) return "";
  const later = sessions
    .filter((s) => (s.campusId ?? null) === (here.campusId ?? null) && startOf(s) > startOf(here))
    .sort((a, b) => startOf(a) - startOf(b));
  return later[0]?.id ?? "";
}

/**
 * The two sessions to preselect. The list arrives newest first, so taking its first two entries would evaluate the NEWER session and enrol into the OLDER one. The source is the session being
 * evaluated: the ACTIVE one (the latest, if several), otherwise the second newest, or the only one there is. The target is the session that begins right after the source, or "".
 */
export function defaultPromotionSessions(sessions: readonly SessionChoice[]): { sourceId: string; targetId: string } {
  const byStart = [...sessions].sort((a, b) => startOf(a) - startOf(b));
  if (byStart.length === 0) return { sourceId: "", targetId: "" };
  const active = byStart.filter((s) => s.status === "ACTIVE");
  const source = active.length > 0 ? active[active.length - 1] : byStart.length >= 2 ? byStart[byStart.length - 2] : byStart[0];
  return { sourceId: source.id, targetId: sessionAfter(byStart, source.id) };
}

/** A pair that cannot be a rollover: the same session twice, a target that does not begin after the source, or two sessions that belong to different calendars. null when the pair is fine. */
export function sessionPairProblem(
  source: { id: string; startDate: Date | string; campusId?: string | null },
  target: { id: string; startDate: Date | string; campusId?: string | null },
): string | null {
  if (source.id === target.id) return "The target session must be different from the source session.";
  if ((source.campusId ?? null) !== (target.campusId ?? null)) {
    return "The two sessions must belong to the same calendar: both the whole school's, or both the same campus's.";
  }
  if (startOf(target) <= startOf(source)) return "The target session must begin after the source session.";
  return null;
}

/** A class may only be rolled inside a calendar it belongs to: a class of a campus in the whole school's sessions or that campus's own; a class of the whole school in any session (campuses may keep their own calendars for shared classes). null when it fits. */
export function classCalendarProblem(classCampusId: string | null, sessionCampusId: string | null): string | null {
  if (classCampusId === null || sessionCampusId === null || sessionCampusId === classCampusId) return null;
  return "This class belongs to another campus than these sessions do.";
}

/**
 * Whether a campus administrator of `ownCampusId` may roll this class between these sessions: a class of their own campus, or a class of the whole school inside their own campus's calendar.
 * A class of the whole school in the whole school's calendar is the school administrator's (it moves every campus's pupils).
 */
export function campusAdminMayRoll(ownCampusId: string | null, classCampusId: string | null, sessionCampusId: string | null): boolean {
  if (ownCampusId === null) return false;
  if (classCampusId !== null) return classCampusId === ownCampusId;
  return sessionCampusId === ownCampusId;
}

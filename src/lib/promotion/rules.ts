import { PromotionDecision } from "@prisma/client";

// The rules of a promotion, as pure functions (task 0031; AlEemaan's task 0025, with "branch" replaced by the school and its campuses). Nothing here reads the database, so every
// rule is a table in tests/unit/promotion-rules.spec.ts. The service (service.ts) feeds them what the database holds and refuses what they refuse.

export const DEFAULT_PASS_MARK = 50;

export interface EvaluationResult {
  decision: PromotionDecision;
  reason: string;
}

export interface ClassGroupMinimal {
  id: string;
  name: string;
  sortOrder: number;
  /// null = a class of the whole school.
  campusId: string | null;
  archivedAt?: Date | null;
  /// The stream this class is ("Science"), or null/absent for a class that is not one (task 0035).
  streamName?: string | null;
}

export interface ClassArmMinimal {
  id: string;
  name: string;
}

/** The mean of the term averages that exist (a term with no published result is left out, not counted as zero), to two decimals; null when there is none. */
export function computeStudentSessionAverage(termAverages: readonly (number | null | undefined)[]): number | null {
  const valid = termAverages.filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  if (valid.length === 0) return null;
  const mean = valid.reduce((sum, score) => sum + score, 0) / valid.length;
  return Math.round(mean * 100) / 100;
}

/** What the rule advises for one pupil. A pupil with no published result at all repeats (nothing was ever stood behind); a pass in the last class graduates. */
export function evaluatePromotionRecommendation(
  overallAverage: number | null,
  isTerminalClass: boolean,
  passMark: number = DEFAULT_PASS_MARK,
): EvaluationResult {
  if (overallAverage === null) {
    return { decision: PromotionDecision.REPEATED, reason: "No published term scores found for this session" };
  }
  if (overallAverage >= passMark) {
    if (isTerminalClass) {
      return {
        decision: PromotionDecision.GRADUATED,
        reason: `Overall session average (${overallAverage.toFixed(2)}%) qualifies for graduation`,
      };
    }
    return {
      decision: PromotionDecision.PROMOTED,
      reason: `Overall session average (${overallAverage.toFixed(2)}%) meets pass mark (${passMark.toFixed(1)}%)`,
    };
  }
  return {
    decision: PromotionDecision.REPEATED,
    reason: `Overall session average (${overallAverage.toFixed(2)}%) is below pass mark (${passMark.toFixed(1)}%)`,
  };
}

/** Whether `candidate` is a class `current` may move up into: a class of the same campus, or - for a campus's class - a class of the whole school. A school-wide class moves into school-wide classes only. */
const sameLadder = (current: ClassGroupMinimal, candidate: ClassGroupMinimal) =>
  candidate.campusId === current.campusId || (current.campusId !== null && candidate.campusId === null);

/** The live classes of the NEXT rung of `current`'s ladder (the lowest `sortOrder` above its own), the campus's own first, then by name. Empty when `current` is the last rung. */
export function nextRungClasses(current: ClassGroupMinimal, all: readonly ClassGroupMinimal[]): ClassGroupMinimal[] {
  const higher = all.filter((c) => !c.archivedAt && c.id !== current.id && c.sortOrder > current.sortOrder && sameLadder(current, c));
  if (higher.length === 0) return [];
  const rung = Math.min(...higher.map((c) => c.sortOrder));
  return higher
    .filter((c) => c.sortOrder === rung)
    .sort(
      (a, b) =>
        Number(b.campusId === current.campusId) - Number(a.campusId === current.campusId) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
}

const sameStream = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a?.trim()) && Boolean(b?.trim()) && a!.trim().toLowerCase() === b!.trim().toLowerCase();

/**
 * Where the pupils of `current` go when `rung` (from `nextRungClasses`) is the next rung (task 0035). One class: that one. Several classes and no stream among them: the first, the same way
 * every time (what the roll did before streams). Several classes with a stream among them: the class of the pupils' own stream, when exactly one qualifies (the campus's own before a
 * school-wide one); otherwise the stream cannot be worked out, `needsPlacement` is true and `target` is only the suggestion (the first), which the roll will not use without being told.
 */
export function streamPlacement(
  current: ClassGroupMinimal,
  rung: readonly ClassGroupMinimal[],
): { target: ClassGroupMinimal | null; needsPlacement: boolean } {
  if (rung.length === 0) return { target: null, needsPlacement: false };
  if (rung.length === 1 || !rung.some((c) => c.streamName?.trim())) return { target: rung[0], needsPlacement: false };
  const matching = rung.filter((c) => sameStream(c.streamName, current.streamName));
  const own = matching.filter((c) => c.campusId === current.campusId);
  const candidates = own.length > 0 ? own : matching;
  if (candidates.length === 1) return { target: candidates[0], needsPlacement: false };
  return { target: candidates[0] ?? rung[0], needsPlacement: true };
}

/**
 * The class a pupil of `current` moves up into: the live class on the next rung (the lowest `sortOrder` above the current one) of the same ladder. Two classes that share a rung
 * are parallel streams, never the next class of each other. When several classes share the next rung the choice is made the same way every time unless the classes name streams
 * (see `streamPlacement`). No higher class means `current` is the last rung (its pupils graduate).
 */
export function resolveNextClassGroup(
  current: ClassGroupMinimal,
  all: readonly ClassGroupMinimal[],
): { nextClass: ClassGroupMinimal | null; isTerminalClass: boolean } {
  const rung = nextRungClasses(current, all);
  return { nextClass: streamPlacement(current, rung).target, isTerminalClass: rung.length === 0 };
}

/** The arm of the next class a promoted pupil goes to: the arm with the same name (any case), else the first arm. null when the class has no arm. */
export function resolveTargetArm(sourceArmName: string | null | undefined, targetArms: readonly ClassArmMinimal[]): string | null {
  if (targetArms.length === 0) return null;
  const wanted = sourceArmName?.trim().toLowerCase();
  if (wanted) {
    const match = targetArms.find((arm) => arm.name.trim().toLowerCase() === wanted);
    if (match) return match.id;
  }
  return targetArms[0].id;
}

/**
 * Whether the session's CURRENT period is its last: promotion belongs to the end of the year. This is advice that the screens show, not a refusal (a school may promote early after a
 * transfer or a restructure; the same open decision as AlEemaan's task 0037).
 */
export function validateSessionPromotionEligibility(periods: readonly { ordinal: number; isCurrent: boolean }[]): {
  eligible: boolean;
  finalPeriodOrdinal: number;
  reason?: string;
} {
  if (periods.length === 0) return { eligible: false, finalPeriodOrdinal: 1, reason: "No academic periods found for this session" };
  const finalOrdinal = Math.max(...periods.map((p) => p.ordinal));
  const current = periods.find((p) => p.isCurrent);
  if (!current) return { eligible: false, finalPeriodOrdinal: finalOrdinal, reason: "No current academic period is set for this session" };
  if (current.ordinal !== finalOrdinal) {
    return {
      eligible: false,
      finalPeriodOrdinal: finalOrdinal,
      reason: `Promotion belongs to the last period of the session (period ${finalOrdinal}). The current period is ${current.ordinal}.`,
    };
  }
  return { eligible: true, finalPeriodOrdinal: finalOrdinal };
}

export {
  campusAdminMayRoll,
  classCalendarProblem,
  defaultPromotionSessions,
  finalTermGap,
  finalTermGapText,
  sessionAfter,
  sessionPairProblem,
  type SessionChoice,
} from "./choices";

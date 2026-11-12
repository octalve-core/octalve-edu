import type { Tx } from "@/lib/tenant/for-tenant";
import { effectiveSwitch } from "@/lib/settings/ceiling-switch";

// Programs: the three-level switch every optional part of a program shares (attendance, assessments, fees, progress records). The school's value and each campus's are the ceiling (the shared
// ceiling switch); the program has its own flag. On for a program only when the school and the program have it on and, when the program runs in chosen campuses, at least one of them does.
// A campus that has it off only leaves its own people out while the others go on. What was recorded stays readable whatever the switches say.

export type FeatureState = {
  on: boolean;
  /// Who decided it is off: the school, the program itself, or every campus of the program.
  offBy: "SCHOOL" | "PROGRAM" | "CAMPUS" | null;
  /// The campuses (of the program, or of the school for a school-wide program) whose own switch is off.
  campusesOff: { id: string; name: string }[];
  /// Is it on for a person who is in the program through `campusId` (null: through the school)? The school's value, and the campus's own.
  isOn: (campusId: string | null) => boolean;
};

/// What the screens are told about a switch (not the function).
export type FeatureView = Pick<FeatureState, "on" | "offBy" | "campusesOff">;

type Stored = (
  tx: Tx,
  tenantId: string,
  campusIds: readonly string[],
) => Promise<{ school: boolean | undefined; campus: Map<string, boolean | undefined> }>;

export async function featureStateOf(
  tx: Tx,
  tenantId: string,
  stored: Stored,
  programId: string,
  programFlag: boolean,
): Promise<FeatureState> {
  const [links, all] = await Promise.all([
    tx.programCampus.findMany({ where: { tenantId, programId }, select: { campusId: true } }),
    tx.campus.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ]);
  const { school, campus } = await stored(
    tx,
    tenantId,
    all.map((row) => row.id),
  );
  const onFor = (campusId: string | null) => effectiveSwitch(school, campusId === null ? undefined : campus.get(campusId));
  const linked = new Set(links.map((link) => link.campusId));
  const scope = linked.size > 0 ? all.filter((row) => linked.has(row.id)) : all;
  const campusesOff = scope.filter((row) => !onFor(row.id)).map((row) => ({ id: row.id, name: row.name }));
  const offBy =
    school === false ? "SCHOOL" : !programFlag ? "PROGRAM" : linked.size > 0 && campusesOff.length === scope.length ? "CAMPUS" : null;
  return { on: offBy === null, offBy, campusesOff, isOn: onFor };
}

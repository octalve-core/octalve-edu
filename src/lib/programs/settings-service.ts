import type { Tx } from "@/lib/tenant/for-tenant";
import { ceilingSwitch } from "@/lib/settings/ceiling-switch";
import {
  PROGRAMS_ENABLED_KEY,
  PROGRAM_ASSESSMENTS_KEY,
  PROGRAM_ATTENDANCE_KEY,
  PROGRAM_FEES_KEY,
  PROGRAM_PROGRESS_GUARDIAN_KEY,
  PROGRAM_PROGRESS_KEY,
  PROGRAM_PROGRESS_STUDENT_KEY,
} from "./rules";

// The one setting of slice P1: `programs.enabled` (task 0027, design 2 point 6). The school's value is the ceiling; a campus can only turn it off. The mechanism is the shared ceiling switch
// over `TenantSetting` (the same one standing uses).

export const programsSwitch = ceilingSwitch({ key: PROGRAMS_ENABLED_KEY, auditAction: "PROGRAMS_SETTING_CHANGED" });

/// The school's own value of `programs.enabled`, or undefined when none is stored (= on).
export async function schoolEnabled(tx: Tx, tenantId: string): Promise<boolean | undefined> {
  return (await programsSwitch.stored(tx, tenantId, [])).school;
}

/// For each campus: does it take part (the school's value AND the campus's)? A campus with nothing stored takes part unless the school has programs off.
export async function campusesTakingPart(tx: Tx, tenantId: string, campusIds: readonly string[]): Promise<Map<string, boolean>> {
  const { school, campus } = await programsSwitch.stored(tx, tenantId, campusIds);
  return new Map(campusIds.map((id) => [id, (school ?? true) && (campus.get(id) ?? true)]));
}

// The optional parts of a program (slices P3 to P5 and the progress records): each is the same ceiling rule over `TenantSetting` (the school's value, a campus's own that can only turn it off) plus
// a third level that belongs to the program itself (a flag on the program, set in its Settings tab).

export const attendanceSwitch = ceilingSwitch({ key: PROGRAM_ATTENDANCE_KEY, auditAction: "PROGRAMS_ATTENDANCE_SETTING_CHANGED" });
export const assessmentsSwitch = ceilingSwitch({ key: PROGRAM_ASSESSMENTS_KEY, auditAction: "PROGRAMS_ASSESSMENTS_SETTING_CHANGED" });
export const feesSwitch = ceilingSwitch({ key: PROGRAM_FEES_KEY, auditAction: "PROGRAMS_FEES_SETTING_CHANGED" });
export const progressSwitch = ceilingSwitch({ key: PROGRAM_PROGRESS_KEY, auditAction: "PROGRAMS_PROGRESS_SETTING_CHANGED" });
export const progressStudentSwitch = ceilingSwitch({
  key: PROGRAM_PROGRESS_STUDENT_KEY,
  auditAction: "PROGRAMS_PROGRESS_STUDENT_SETTING_CHANGED",
});
export const progressGuardianSwitch = ceilingSwitch({
  key: PROGRAM_PROGRESS_GUARDIAN_KEY,
  auditAction: "PROGRAMS_PROGRESS_GUARDIAN_SETTING_CHANGED",
});

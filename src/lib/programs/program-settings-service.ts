import { Prisma, type Program, type ProgressGuardianDetail, type ProgressWriters } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import { parseBands, type Band } from "./assessment-rules";
import { parseSignatories, wordingProblem, type Signatory } from "./completion-rules";
import { isPresetKey, presetSchema, type PresetKey } from "./progress-templates";
import { change, done, refuse, writeAudit, type Result } from "./common";

// The program's own settings (task 0027): its switches and numbers. The school's administrator or a program admin; saving what is stored already writes nothing; every change is audited with
// the old and new values. (Slices P3b, P4 and P5 add their fields here.)

export type ProgramSettings = {
  attendanceEnabled: boolean;
  lowAttendancePercent: number;
  assessmentsEnabled: boolean;
  gradeBands: Band[];
  feesEnabled: boolean;
  certTitle: string;
  certBody: string;
  certSignatories: Signatory[];
  completionMinAverage: number | null;
  completionRequirePassed: boolean;
  noCertWhileOwing: boolean;
  progressEnabled: boolean;
  progressTemplate: PresetKey | null;
  progressWriters: ProgressWriters;
  progressRequireVerification: boolean;
  progressFourEyes: boolean;
  progressLockInactivity: number;
  progressLockRelease: number;
  progressStudentView: boolean;
  progressGuardianView: boolean;
  progressGuardianDetail: ProgressGuardianDetail;
  progressHijriAdjust: number;
};
export type ProgramSettingsInput = Partial<ProgramSettings>;

export const settingsOf = (program: Program): ProgramSettings => ({
  attendanceEnabled: program.attendanceEnabled,
  lowAttendancePercent: program.lowAttendancePercent,
  assessmentsEnabled: program.assessmentsEnabled,
  gradeBands: parseBands(program.gradeBands),
  feesEnabled: program.feesEnabled,
  certTitle: program.certTitle,
  certBody: program.certBody,
  certSignatories: parseSignatories(program.certSignatories),
  completionMinAverage: program.completionMinAverage === null ? null : Number(program.completionMinAverage),
  completionRequirePassed: program.completionRequirePassed,
  noCertWhileOwing: program.noCertWhileOwing,
  progressEnabled: program.progressEnabled,
  progressTemplate: isPresetKey(program.progressTemplate) ? program.progressTemplate : null,
  progressWriters: program.progressWriters,
  progressRequireVerification: program.progressRequireVerification,
  progressFourEyes: program.progressFourEyes,
  progressLockInactivity: program.progressLockInactivity,
  progressLockRelease: program.progressLockRelease,
  progressStudentView: program.progressStudentView,
  progressGuardianView: program.progressGuardianView,
  progressGuardianDetail: program.progressGuardianDetail,
  progressHijriAdjust: program.progressHijriAdjust,
});

export async function updateProgramSettings(
  auth: TenantAuthContext,
  programId: string,
  input: ProgramSettingsInput,
): Promise<Result<ProgramSettings>> {
  const { tenantId } = auth.tenant;
  return change(auth, programId, "manage", async ({ tx, program, viewer }) => {
    const before = settingsOf(program);
    const next: ProgramSettings = { ...before, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
    if (JSON.stringify(next) === JSON.stringify(before)) return done(next);
    const problem = wordingProblem({ title: next.certTitle, body: next.certBody, signatories: next.certSignatories });
    if (problem) {
      const field = /title/i.test(problem) ? "certTitle" : /signator/i.test(problem) ? "certSignatories" : "certBody";
      return refuse(400, "VALIDATION", problem, [{ path: `body.${field}`, message: problem }]);
    }
    // Progress records: four-eyes is the school's decision, not a program admin's; the template is chosen once records are wanted and cannot be swapped under records already kept.
    if (next.progressFourEyes !== before.progressFourEyes && viewer.level !== "SUPER")
      return refuse(403, "FORBIDDEN", "Only the school's administrator can change whether someone else has to verify an entry.");
    if (next.progressEnabled && !next.progressTemplate)
      return refuse(400, "VALIDATION", "Choose a template before turning progress records on.", [
        { path: "body.progressTemplate", message: "Choose a template first." },
      ]);
    if (next.progressTemplate !== before.progressTemplate && next.progressTemplate) {
      if ((await tx.progressRecord.count({ where: { tenantId, programId: program.id } })) > 0)
        return refuse(409, "TEMPLATE_IN_USE", "Records have been started with the current template, so it can't be swapped.");
      const exists = await tx.progressTemplate.findFirst({
        where: { tenantId, programId: program.id, key: next.progressTemplate, version: 1 },
        select: { id: true },
      });
      if (!exists)
        await tx.progressTemplate.create({
          data: {
            tenantId,
            programId: program.id,
            key: next.progressTemplate,
            version: 1,
            schema: presetSchema(next.progressTemplate) as unknown as Prisma.InputJsonValue,
            createdByUserId: auth.userId,
          },
        });
    }
    await tx.program.update({
      where: { tenantId_id: { tenantId, id: program.id } },
      data: {
        attendanceEnabled: next.attendanceEnabled,
        lowAttendancePercent: next.lowAttendancePercent,
        assessmentsEnabled: next.assessmentsEnabled,
        gradeBands: next.gradeBands.length === 0 ? Prisma.DbNull : (next.gradeBands as unknown as Prisma.InputJsonValue),
        feesEnabled: next.feesEnabled,
        certTitle: next.certTitle,
        certBody: next.certBody,
        certSignatories: next.certSignatories.length === 0 ? Prisma.DbNull : (next.certSignatories as unknown as Prisma.InputJsonValue),
        completionMinAverage: next.completionMinAverage,
        completionRequirePassed: next.completionRequirePassed,
        noCertWhileOwing: next.noCertWhileOwing,
        progressEnabled: next.progressEnabled,
        progressTemplate: next.progressTemplate,
        progressWriters: next.progressWriters,
        progressRequireVerification: next.progressRequireVerification,
        progressFourEyes: next.progressFourEyes,
        progressLockInactivity: next.progressLockInactivity,
        progressLockRelease: next.progressLockRelease,
        progressStudentView: next.progressStudentView,
        progressGuardianView: next.progressGuardianView,
        progressGuardianDetail: next.progressGuardianDetail,
        progressHijriAdjust: next.progressHijriAdjust,
      },
    });
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId: auth.userId,
      action: "PROGRAM_SETTINGS_CHANGED",
      targetType: "Program",
      targetId: program.id,
      before: before as unknown as Prisma.InputJsonValue,
      after: next as unknown as Prisma.InputJsonValue,
    });
    return done(next);
  });
}

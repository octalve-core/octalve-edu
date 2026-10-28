import "./env";
import crypto from "node:crypto";
import { Role, addMembership, createUser, db, type TestTenant, type TestUser } from "./db";
import { cookieHeader } from "./http";
import { createSession } from "@/lib/auth/session";

// Fixtures for the specs of the question bank and forms parity build (task 0024 slices 3 to 10): people with a session cookie, a pupil with an account and a class,
// a guardian linked to pupils, approved bank questions and the bank's switches. Everything is arranged through the admin client (`db`), so the specs can put the
// database in any state the application itself would refuse to reach; what they then ask of the application goes over HTTP.

const rand = () => crypto.randomBytes(3).toString("hex");

/// A session cookie for `user`, without a sign-in round trip.
export const cookieFor = async (user: TestUser) => cookieHeader((await createSession(user.id)).token);

export type Person = { user: TestUser; cookie: string };

/// A person with an ACTIVE membership of `tenant` in `role` (for `campusId`, or the whole school when null).
export async function member(tenant: TestTenant, role: Role, campusId: string | null, name = `${role} Person`): Promise<Person> {
  const user = await createUser({ name });
  await addMembership(user.id, tenant.id, role, campusId);
  return { user, cookie: await cookieFor(user) };
}

/// The school's one active academic session (made on first use).
export async function activeSession(tenant: TestTenant): Promise<string> {
  const existing = await db.academicSession.findFirst({ where: { tenantId: tenant.id, status: "ACTIVE" }, select: { id: true } });
  if (existing) return existing.id;
  return (
    await db.academicSession.create({
      data: { tenantId: tenant.id, label: "2046", startDate: new Date("2046-09-01"), endDate: new Date("2047-07-01"), status: "ACTIVE" },
    })
  ).id;
}

/// A class (found or made by name for the campus) with one arm, and the arm's id.
export async function classArm(
  tenant: TestTenant,
  campusId: string | null,
  groupName: string,
): Promise<{ groupId: string; armId: string }> {
  let group = await db.classGroup.findFirst({ where: { tenantId: tenant.id, campusId, name: groupName } });
  group ??= await db.classGroup.create({ data: { tenantId: tenant.id, campusId, name: groupName, sortOrder: 1 } });
  let arm = await db.classArm.findFirst({ where: { tenantId: tenant.id, classGroupId: group.id } });
  arm ??= await db.classArm.create({ data: { tenantId: tenant.id, classGroupId: group.id, name: "A" } });
  return { groupId: group.id, armId: arm.id };
}

export type Pupil = Person & { student: { id: string; campusId: string | null } };

/// A pupil with a sign-in (a STUDENT membership), a student record and, when `groupName` is given, an ACTIVE enrolment in that class.
export async function pupil(tenant: TestTenant, campusId: string | null, groupName: string | null, name = "Pupil"): Promise<Pupil> {
  const who = await member(tenant, Role.STUDENT, campusId, name);
  const student = await db.studentRecord.create({
    data: {
      tenantId: tenant.id,
      campusId,
      userId: who.user.id,
      firstName: name,
      lastName: rand(),
      dateOfBirth: new Date("2012-05-05"),
      admissionNo: `Q/${rand()}${rand()}`,
    },
    select: { id: true, campusId: true },
  });
  if (groupName) {
    const { armId } = await classArm(tenant, campusId, groupName);
    await db.studentEnrollment.create({
      data: { tenantId: tenant.id, sessionId: await activeSession(tenant), classArmId: armId, studentId: student.id, status: "ACTIVE" },
    });
  }
  return { ...who, student };
}

/// A guardian with a sign-in (a PARENT membership) linked, with `status`, to each of `studentIds`.
export async function guardianOf(
  tenant: TestTenant,
  studentIds: string[],
  status: "APPROVED" | "PENDING" | "REVOKED" = "APPROVED",
  name = "Guardian",
): Promise<Person> {
  const who = await member(tenant, Role.PARENT, null, name);
  const record = await db.guardianRecord.create({ data: { tenantId: tenant.id, userId: who.user.id, firstName: name, lastName: rand() } });
  for (const studentId of studentIds) {
    // the database refuses a REVOKED link with no time of revocation (GuardianLink_revoked_consistent)
    await db.guardianLink.create({
      data: {
        tenantId: tenant.id,
        studentId,
        guardianId: record.id,
        relationship: "GUARDIAN",
        status,
        ...(status === "REVOKED" ? { revokedAt: new Date() } : {}),
      },
    });
  }
  return who;
}

let counter = 0;

/// An APPROVED, practice-visible question (single answer, correct answer "a") written and approved by `byUserId`.
export function approvedItem(tenantId: string, campusId: string | null, byUserId: string, over: Record<string, unknown> = {}) {
  return db.questionBankItem.create({
    data: {
      tenantId,
      campusId,
      type: "SINGLE",
      prompt: `Practice question number ${++counter} ${rand()}`,
      options: [
        { id: "a", text: "First" },
        { id: "b", text: "Second" },
      ],
      correctAnswer: "a",
      explanation: "Because the first is right.",
      subjectLabel: "Mathematics",
      subjectKey: "mathematics",
      visibility: "PRACTICE",
      status: "APPROVED",
      submittedById: byUserId,
      approvedById: byUserId,
      approvedAt: new Date(),
      ...over,
    } as never,
  });
}

/// A school-wide value for one of the bank's switches (`campusId` for a campus's own).
export function setBank(tenantId: string, byUserId: string, key: string, value: unknown, campusId: string | null = null) {
  return db.questionBankSetting.create({ data: { tenantId, campusId, key, value: value as never, updatedById: byUserId } });
}

/// Empties the practice tables and the switches between tests of a spec.
export async function resetPractice() {
  await db.$executeRawUnsafe(`TRUNCATE "PracticeAttempt", "PracticeSession", "QuestionBankSetting" RESTART IDENTITY CASCADE`);
}

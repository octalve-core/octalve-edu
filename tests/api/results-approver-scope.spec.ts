import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Permission, ResultStatus } from "@prisma/client";
import {
  Role,
  addMembership,
  createTenant,
  createUser,
  db,
  grantApprovalScope,
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Where a person approves results (ADR 0018): GENERAL (the whole campus), a SECTION or one CLASS, set by an administrator. The scope governs what the approver sees (the
// results list) AND what they may do (approve, return, publish, revert, lock), and no scope means nothing to approve. A teacher's own submit is not an approval, and an
// administrator is held to no scope.
//
// The school: two sections, Junior (JSS 1, JSS 2) and Senior (SSS 1), and a class (Primary 1) that is in no section. One pupil is on the roll of each class's arm, and one has
// withdrawn from JSS 1. Every pupil has one SUBMITTED result.

const SAAS = { baseUrl: SAAS_URL };

let a: TestTenant;
let admin: TestUser;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};

let period: { id: string };
let maths: { id: string };
let junior: { id: string };
let senior: { id: string };
let groups: Record<"jss1" | "jss2" | "sss1" | "pri1", { id: string }>;
let arms: Record<"jss1" | "jss2" | "sss1" | "pri1", { id: string }>;
/// the result of each pupil, by where the pupil is
let result: Record<"jss1" | "jss2" | "sss1" | "pri1" | "withdrawn", string>;
let n = 0;

async function cookieFor(user: TestUser) {
  const res = await loginAs(user, SAAS);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const base = () => `/api/v1/schools/${a.code}`;
const list = async (who: string) => {
  const res = await api(`${base()}/academics/results`, as(who));
  expect(res.status, `${who}: ${res.text}`).toBe(200);
  return (res.json.data.results as Array<{ id: string }>).map((row) => row.id).sort();
};
const move = (who: string, resultIds: string[], toStatus: ResultStatus, reason?: string) =>
  api(`${base()}/academics/results/transition`, {
    ...as(who),
    method: "POST",
    body: { resultIds, toStatus, ...(reason ? { reason } : {}) },
  });
const setStatus = (ids: string[], status: ResultStatus) => db.result.updateMany({ where: { id: { in: ids } }, data: { status } });
const statusOf = async (id: string) => (await db.result.findUniqueOrThrow({ where: { id } })).status;
const sorted = (ids: string[]) => [...ids].sort();

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Approver Scopes" });

  for (const key of ["general", "juniorApprover", "jss2Approver", "noScope", "plainTeacher", "newApprover"])
    people[key] = await createUser();
  admin = await createUser();
  await addMembership(admin.id, a.id, Role.ADMIN);
  await addMembership(people.plainTeacher.id, a.id, Role.TEACHING_STAFF);
  await addMembership(people.newApprover.id, a.id, Role.TEACHING_STAFF);
  for (const key of ["general", "juniorApprover", "jss2Approver", "noScope"]) {
    await db.tenantMembership.create({
      data: { userId: people[key].id, tenantId: a.id, role: Role.TEACHING_STAFF, permissions: [Permission.CAN_APPROVE_RESULTS] },
    });
  }

  const session = await db.academicSession.create({
    data: { tenantId: a.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  period = await db.academicPeriod.create({
    data: {
      tenantId: a.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-15"),
      isCurrent: true,
    },
  });
  maths = await db.subject.create({ data: { tenantId: a.id, name: "Mathematics", code: "MAS1" } });
  junior = await db.section.create({ data: { tenantId: a.id, name: "Junior", sortOrder: 1 } });
  senior = await db.section.create({ data: { tenantId: a.id, name: "Senior", sortOrder: 2 } });
  const group = (name: string, sortOrder: number, sectionId?: string) =>
    db.classGroup.create({ data: { tenantId: a.id, name, sortOrder, ...(sectionId ? { sectionId } : {}) } });
  groups = {
    jss1: await group("JSS 1", 1, junior.id),
    jss2: await group("JSS 2", 2, junior.id),
    sss1: await group("SSS 1", 3, senior.id),
    pri1: await group("Primary 1", 0),
  };
  const arm = (key: keyof typeof groups) => db.classArm.create({ data: { tenantId: a.id, classGroupId: groups[key].id, name: "A" } });
  arms = { jss1: await arm("jss1"), jss2: await arm("jss2"), sss1: await arm("sss1"), pri1: await arm("pri1") };

  await grantApprovalScope(people.general.id, a.id);
  await grantApprovalScope(people.juniorApprover.id, a.id, { kind: "SECTION", sectionId: junior.id });
  await grantApprovalScope(people.jss2Approver.id, a.id, { kind: "CLASS", classGroupId: groups.jss2.id });

  const pupil = async (label: string, armId: string | null, status: "ACTIVE" | "WITHDRAWN" = "ACTIVE") => {
    n += 1;
    const student = await db.studentRecord.create({
      data: {
        tenantId: a.id,
        firstName: label,
        lastName: "Scoped",
        dateOfBirth: new Date("2013-03-03"),
        admissionNo: `AS-${Date.now()}-${n}`,
      },
    });
    if (armId)
      await db.studentEnrollment.create({
        data: { tenantId: a.id, sessionId: session.id, classArmId: armId, studentId: student.id, status },
      });
    const made = await db.result.create({
      data: {
        tenantId: a.id,
        studentId: student.id,
        subjectId: maths.id,
        periodId: period.id,
        score: 60,
        status: ResultStatus.SUBMITTED,
        verificationToken: `as-${Date.now()}-${n}`,
      },
    });
    return made.id;
  };
  result = {
    jss1: await pupil("Joke", arms.jss1.id),
    jss2: await pupil("Jide", arms.jss2.id),
    sss1: await pupil("Sade", arms.sss1.id),
    pri1: await pupil("Pere", arms.pri1.id),
    withdrawn: await pupil("Wale", arms.jss1.id, "WITHDRAWN"),
  };

  for (const [key, user] of Object.entries({ ...people, admin })) cookie[key] = await cookieFor(user);
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

test.beforeEach(async () => {
  // every test starts from the same place: all five results SUBMITTED, the sections live, nobody teaching anything
  await setStatus(Object.values(result), ResultStatus.SUBMITTED);
  await db.section.updateMany({ where: { tenantId: a.id }, data: { archivedAt: null } });
  await db.staffSubjectAssignment.deleteMany({ where: { tenantId: a.id } });
  await db.staffRecord.deleteMany({ where: { tenantId: a.id } });
});

test.describe("what an approver sees", () => {
  test("a GENERAL approver sees the whole campus's results, and so does an administrator", async () => {
    expect(await list("general")).toEqual(sorted(Object.values(result)));
    expect(await list("admin")).toEqual(sorted(Object.values(result)));
  });

  test("a SECTION approver sees the classes of that section only: JSS 1 and JSS 2, not SSS 1, not the class in no section, not a pupil who has withdrawn", async () => {
    expect(await list("juniorApprover")).toEqual(sorted([result.jss1, result.jss2]));
  });

  test("a CLASS approver sees that class only, even when the class is in a section someone else covers", async () => {
    expect(await list("jss2Approver")).toEqual([result.jss2]);
  });

  test("an approver with no scope sees nothing, and nothing is approved for them (fail closed)", async () => {
    expect(await list("noScope")).toEqual([]);
    const res = await move("noScope", [result.jss1], ResultStatus.APPROVED);
    expect(res.status, res.text).toBe(403);
    expect(await statusOf(result.jss1)).toBe(ResultStatus.SUBMITTED);
  });

  test("a teacher who is also an approver sees the union of the arms they teach and their scope; a teacher who is not an approver sees only the arms they teach", async () => {
    const staff = await db.staffRecord.create({
      data: { tenantId: a.id, userId: people.juniorApprover.id, category: "TEACHING", firstName: "Jo", lastName: "Teaches" },
    });
    await db.staffSubjectAssignment.create({
      data: { tenantId: a.id, staffRecordId: staff.id, subjectId: maths.id, classArmId: arms.sss1.id },
    });
    expect(await list("juniorApprover")).toEqual(sorted([result.jss1, result.jss2, result.sss1]));
    expect(await list("plainTeacher")).toEqual([]);
  });

  test("archiving a section ends what it granted", async () => {
    await db.section.update({ where: { id: junior.id }, data: { archivedAt: new Date() } });
    expect(await list("juniorApprover")).toEqual([]);
    const res = await move("juniorApprover", [result.jss1], ResultStatus.APPROVED);
    expect(res.status, res.text).toBe(403);
    expect(await list("jss2Approver")).toEqual([result.jss2]); // a class scope does not depend on the section
  });
});

test.describe("what an approver may do: every transition that needs approval authority is held to the scope", () => {
  const REASON = "Needs another look";
  // [from, to, a reason when one is required]
  const transitions: [ResultStatus, ResultStatus, string | undefined][] = [
    [ResultStatus.SUBMITTED, ResultStatus.APPROVED, undefined], // approve
    [ResultStatus.SUBMITTED, ResultStatus.DRAFT, REASON], // return to the teacher
    [ResultStatus.APPROVED, ResultStatus.PUBLISHED, undefined], // publish
    [ResultStatus.APPROVED, ResultStatus.SUBMITTED, REASON], // pull back
    [ResultStatus.PUBLISHED, ResultStatus.LOCKED, undefined], // lock
  ];
  for (const [from, to, reason] of transitions) {
    test(`${from} to ${to}: a SECTION approver may on a class of the section, and may not on another section's class, a class in no section, or a mix`, async () => {
      await setStatus(Object.values(result), from);
      const inside = await move("juniorApprover", [result.jss1], to, reason);
      expect(inside.status, inside.text).toBe(200);
      expect(await statusOf(result.jss1)).toBe(to);

      for (const outside of [result.sss1, result.pri1]) {
        const res = await move("juniorApprover", [outside], to, reason);
        expect(res.status, `${from} to ${to}: ${res.text}`).toBe(403);
        expect(res.json.error.message).toMatch(/outside the classes you approve/);
        expect(await statusOf(outside)).toBe(from);
      }
      // one result outside the scope refuses the whole request: the one inside it does not move either
      const mixed = await move("juniorApprover", [result.jss2, result.sss1], to, reason);
      expect(mixed.status, mixed.text).toBe(403);
      expect(await statusOf(result.jss2)).toBe(from);
    });
  }

  test("a CLASS approver may act on that class and not on another class of the same section", async () => {
    expect((await move("jss2Approver", [result.jss2], ResultStatus.APPROVED)).status).toBe(200);
    const res = await move("jss2Approver", [result.jss1], ResultStatus.APPROVED);
    expect(res.status, res.text).toBe(403);
    expect(await statusOf(result.jss1)).toBe(ResultStatus.SUBMITTED);
  });

  test("a result an approver can SEE but not approve (they teach the arm) is refused with the scope's words, not the permission's", async () => {
    const staff = await db.staffRecord.create({
      data: { tenantId: a.id, userId: people.jss2Approver.id, category: "TEACHING", firstName: "Ji", lastName: "Teaches" },
    });
    await db.staffSubjectAssignment.create({
      data: { tenantId: a.id, staffRecordId: staff.id, subjectId: maths.id, classArmId: arms.sss1.id },
    });
    expect(await list("jss2Approver")).toEqual(sorted([result.jss2, result.sss1]));
    const res = await move("jss2Approver", [result.sss1], ResultStatus.APPROVED);
    expect(res.status, res.text).toBe(403);
    expect(res.json.error.message).toMatch(/outside the classes you approve/);
    expect(res.json.error.message).not.toMatch(/requires CAN_APPROVE_RESULTS/);
  });

  test("a GENERAL approver and an administrator may act on every class", async () => {
    expect((await move("general", [result.jss1, result.sss1, result.pri1, result.withdrawn], ResultStatus.APPROVED)).status).toBe(200);
    await setStatus(Object.values(result), ResultStatus.SUBMITTED);
    expect((await move("admin", [result.jss1, result.sss1, result.pri1, result.withdrawn], ResultStatus.APPROVED)).status).toBe(200);
  });

  test("a teacher's own submit is not an approval: an approver submits their own draft in a class outside their scope", async () => {
    await db.result.update({
      where: { id: result.sss1 },
      data: { status: ResultStatus.DRAFT, enteredByStaffId: people.juniorApprover.id },
    });
    const res = await move("juniorApprover", [result.sss1], ResultStatus.SUBMITTED);
    expect(res.status, res.text).toBe(200);
    await db.result.update({ where: { id: result.sss1 }, data: { enteredByStaffId: null } });
  });

  test("a result of another school is not found, whatever the approver's scope", async () => {
    const other = await createTenant({ name: "Beta Approver Scopes" });
    const res = await api(`/api/v1/schools/${other.code}/academics/results/transition`, {
      ...as("general"),
      method: "POST",
      body: { resultIds: [result.jss1], toStatus: ResultStatus.APPROVED },
    });
    expect([403, 404]).toContain(res.status); // not a member of that school: refused before the scope is asked
    expect(await statusOf(result.jss1)).toBe(ResultStatus.SUBMITTED);
  });
});

test.describe("the permission and the scope go together", () => {
  const members = (userId: string) => `${base()}/members/${userId}`;
  const scopesOf = (userId: string) => db.resultApprovalScope.findMany({ where: { tenantId: a.id, userId } });
  const changes = (userId: string) =>
    db.auditLog.count({ where: { tenantId: a.id, targetId: userId, action: "RESULT_APPROVAL_SCOPE_CHANGED" } });

  test("granting CAN_APPROVE_RESULTS gives a GENERAL scope (the whole campus, as before), audited; removing it removes the scope, audited", async () => {
    const id = people.newApprover.id;
    expect(await scopesOf(id)).toHaveLength(0);

    const granted = await api(members(id), { ...as("admin"), method: "PATCH", body: { permissions: ["CAN_APPROVE_RESULTS"] } });
    expect(granted.status, granted.text).toBe(200);
    const rows = await scopesOf(id);
    expect(rows.map((row) => row.kind)).toEqual(["GENERAL"]);
    expect(rows[0].createdById).toBe(admin.id);
    expect(await changes(id)).toBe(1);
    cookie.newApprover = await cookieFor(people.newApprover);
    expect((await move("newApprover", [result.sss1], ResultStatus.APPROVED)).status).toBe(200);

    const removed = await api(members(id), { ...as("admin"), method: "PATCH", body: { permissions: [] } });
    expect(removed.status, removed.text).toBe(200);
    expect(await scopesOf(id)).toHaveLength(0);
    expect(await changes(id)).toBe(2);
  });

  test("a role that cannot hold the permission clears the scope with it", async () => {
    const id = people.newApprover.id;
    expect((await api(members(id), { ...as("admin"), method: "PATCH", body: { permissions: ["CAN_APPROVE_RESULTS"] } })).status).toBe(200);
    await db.resultApprovalScope.deleteMany({ where: { tenantId: a.id, userId: id, kind: "GENERAL" } });
    await grantApprovalScope(id, a.id, { kind: "CLASS", classGroupId: groups.jss1.id });
    const moved = await api(members(id), { ...as("admin"), method: "PATCH", body: { role: "PARENT" } });
    expect(moved.status, moved.text).toBe(200);
    expect(await scopesOf(id)).toHaveLength(0);
    await db.tenantMembership.update({ where: { userId_tenantId: { userId: id, tenantId: a.id } }, data: { role: Role.TEACHING_STAFF } });
  });

  test("the database refuses a scope whose kind and target disagree, and the same scope twice", async () => {
    const id = people.general.id;
    await expect(db.resultApprovalScope.create({ data: { tenantId: a.id, userId: id, kind: "SECTION" } })).rejects.toThrow();
    await expect(
      db.resultApprovalScope.create({ data: { tenantId: a.id, userId: id, kind: "GENERAL", sectionId: junior.id } }),
    ).rejects.toThrow();
    await expect(
      db.resultApprovalScope.create({
        data: { tenantId: a.id, userId: id, kind: "CLASS", classGroupId: groups.jss1.id, sectionId: junior.id },
      }),
    ).rejects.toThrow();
    await expect(grantApprovalScope(id, a.id)).rejects.toThrow(); // the GENERAL scope is already there
    await grantApprovalScope(id, a.id, { kind: "CLASS", classGroupId: groups.jss1.id });
    await expect(grantApprovalScope(id, a.id, { kind: "CLASS", classGroupId: groups.jss1.id })).rejects.toThrow();
    await db.resultApprovalScope.deleteMany({ where: { tenantId: a.id, userId: id, kind: "CLASS" } });
  });

  test("a section's live name is unique in its school, ignoring case, and free again once archived", async () => {
    await expect(db.section.create({ data: { tenantId: a.id, name: "JUNIOR" } })).rejects.toThrow();
    await db.section.update({ where: { id: junior.id }, data: { archivedAt: new Date() } });
    const again = await db.section.create({ data: { tenantId: a.id, name: "Junior" } });
    await db.section.delete({ where: { id: again.id } });
  });
});

import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, Permission, ResultStatus } from "@prisma/client";
import {
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

// Recording results (POST /academics/results) and listing them (GET): the rules the PRD gives the lifecycle (a result is edited only while it is DRAFT; a
// correction goes back through the lifecycle with a reason), that a refused request changes nothing, and the campus a member works at.
// A teacher records only for the students of an arm they are assigned the subject in (tests/api/results-assigned-subject.spec.ts): every pupil here is on
// one arm's roll and every subject is assigned to the teachers in it, so the cases below are about the rules above and not about that one.

const SAAS = { baseUrl: SAAS_URL };

let a: TestTenant;
let b: TestTenant;
let admin: TestUser;
let teacher: TestUser;
let approver: TestUser;
let northTeacher: TestUser;
let northClerk: TestUser;
let parent: TestUser;
let outsider: TestUser;
const cookie: Record<string, string> = {};

let session: { id: string };
let period: { id: string };
let arm: { id: string };
let stranger: { id: string };
const staff: Record<string, string> = {};
let n = 0;

async function cookieFor(user: TestUser) {
  const res = await loginAs(user, SAAS);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Results Rules", campuses: ["Alpha North", "Alpha South"] });
  b = await createTenant({ name: "Beta Results Rules" });

  admin = await createUser();
  teacher = await createUser();
  approver = await createUser();
  northTeacher = await createUser();
  northClerk = await createUser();
  parent = await createUser();
  outsider = await createUser();

  await addMembership(admin.id, a.id, Role.ADMIN);
  await addMembership(teacher.id, a.id, Role.TEACHING_STAFF);
  await db.tenantMembership.create({
    data: { userId: approver.id, tenantId: a.id, role: Role.TEACHING_STAFF, permissions: [Permission.CAN_APPROVE_RESULTS] },
  });
  await grantApprovalScope(approver.id, a.id); // a general approver, as granting the permission through the API gives
  await addMembership(northTeacher.id, a.id, Role.TEACHING_STAFF, a.campuses[0].id);
  await addMembership(northClerk.id, a.id, Role.NON_TEACHING_STAFF, a.campuses[0].id);
  await addMembership(parent.id, a.id, Role.PARENT);
  await addMembership(outsider.id, b.id, Role.ADMIN);

  for (const [key, user] of Object.entries({ admin, teacher, approver, northTeacher, northClerk, parent, outsider }))
    cookie[key] = await cookieFor(user);

  session = await db.academicSession.create({
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
  // the one arm every pupil is on, and the teachers who teach in it (the north teacher's staff record is in the north campus, as their membership is)
  const group = await db.classGroup.create({ data: { tenantId: a.id, name: "Grade 9", sortOrder: 1 } });
  arm = await db.classArm.create({ data: { tenantId: a.id, classGroupId: group.id, name: "A" } });
  for (const [key, user, campusId] of [
    ["teacher", teacher, null],
    ["approver", approver, null],
    ["northTeacher", northTeacher, a.campuses[0].id],
  ] as const) {
    const record = await db.staffRecord.create({
      data: { tenantId: a.id, userId: user.id, category: "TEACHING", firstName: key, lastName: "Rules", campusId },
    });
    staff[key] = record.id;
  }
  // a pupil of the other school: never reachable from this one
  stranger = await db.studentRecord.create({
    data: { tenantId: b.id, firstName: "Out", lastName: "Sider", dateOfBirth: new Date("2011-01-01"), admissionNo: "B-0001" },
  });
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

const as = (who: string, extra: object = {}) => ({ ...SAAS, cookie: cookie[who], ...extra });
const resultsRoute = () => `/api/v1/schools/${a.code}/academics/results`;
const transitionRoute = () => `/api/v1/schools/${a.code}/academics/results/transition`;

/// A pupil on the roll of the arm in the active session.
async function pupil(campusId: string | null = null) {
  n += 1;
  const student = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      firstName: `Pupil${n}`,
      lastName: "Rules",
      dateOfBirth: new Date("2011-03-03"),
      admissionNo: `RR-${Date.now()}-${n}`,
      campusId,
    },
  });
  await db.studentEnrollment.create({
    data: { tenantId: a.id, sessionId: session.id, classArmId: arm.id, studentId: student.id, status: "ACTIVE" },
  });
  return student;
}
/// A subject the teachers of the arm are assigned to teach in it.
async function subject() {
  n += 1;
  const made = await db.subject.create({ data: { tenantId: a.id, name: `Subject ${n}`, code: `RS${n}` } });
  await db.staffSubjectAssignment.createMany({
    data: Object.values(staff).map((staffRecordId) => ({ tenantId: a.id, staffRecordId, subjectId: made.id, classArmId: arm.id })),
  });
  return made;
}
/// A result as it stands in `status` (written straight to the table: what the lifecycle would have left).
async function seed(studentId: string, subjectId: string, status: ResultStatus, score = 50) {
  const past = status === ResultStatus.PUBLISHED || status === ResultStatus.LOCKED;
  return db.result.create({
    data: {
      tenantId: a.id,
      studentId,
      subjectId,
      periodId: period.id,
      score,
      status,
      componentScores: [{ name: "Examination", score, maxScore: 100 }],
      gradeLetter: "C",
      enteredByStaffId: teacher.id,
      verificationToken: `tok-${Date.now()}-${n++}`,
      verificationHash: past ? "a".repeat(64) : null,
      publishedAt: past ? new Date() : null,
      lockedAt: status === ResultStatus.LOCKED ? new Date() : null,
    },
  });
}
const row = (id: string) => db.result.findUniqueOrThrow({ where: { id } });
const audits = (id: string) => db.resultAudit.count({ where: { resultId: id } });
const record = (who: string, subjectId: string, results: object[]) =>
  api(resultsRoute(), as(who, { method: "POST", body: { periodId: period.id, subjectId, results } }));
const list = (who: string, subjectId: string) => api(`${resultsRoute()}?periodId=${period.id}&subjectId=${subjectId}`, as(who));
const move = (who: string, resultIds: string[], toStatus: string, reason?: string) =>
  api(transitionRoute(), as(who, { method: "POST", body: { resultIds, toStatus, ...(reason ? { reason } : {}) } }));

test.describe("a result is edited only while it is DRAFT", () => {
  for (const status of [ResultStatus.SUBMITTED, ResultStatus.APPROVED, ResultStatus.PUBLISHED, ResultStatus.LOCKED]) {
    test(`a result that is ${status} is not changed by recording again: 409, and nothing about it moves`, async () => {
      const s = await pupil();
      const sub = await subject();
      const made = await seed(s.id, sub.id, status);
      const before = await row(made.id);
      const auditsBefore = await audits(made.id);

      for (const who of ["teacher", "admin"]) {
        const res = await record(who, sub.id, [
          { studentId: s.id, score: 91, components: [{ name: "Examination", score: 91, maxScore: 100 }] },
        ]);
        expect.soft(res.status, `${who}: ${res.text}`).toBe(409);
      }
      expect(await row(made.id)).toEqual(before);
      expect(await audits(made.id)).toBe(auditsBefore);
    });
  }

  test("a DRAFT result can be entered and corrected, and a correction leaves an audit row (as before)", async () => {
    const s = await pupil();
    const sub = await subject();
    expect((await record("teacher", sub.id, [{ studentId: s.id, score: 70 }])).status).toBe(200);
    const made = await db.result.findFirstOrThrow({ where: { studentId: s.id, subjectId: sub.id } });
    expect(made.status).toBe("DRAFT");
    expect(Number(made.score)).toBe(70);

    // another teacher may correct a draft, and so may an administrator
    expect((await record("approver", sub.id, [{ studentId: s.id, score: 75 }])).status).toBe(200);
    expect((await record("admin", sub.id, [{ studentId: s.id, score: 80 }])).status).toBe(200);
    const edited = await row(made.id);
    expect(Number(edited.score)).toBe(80);
    expect(edited.status).toBe("DRAFT");
    expect(await audits(made.id)).toBe(2);
  });

  test("the way to correct a LOCKED result is the lifecycle: an administrator unlocks it to DRAFT with a reason, and then it can be edited", async () => {
    const s = await pupil();
    const sub = await subject();
    const made = await seed(s.id, sub.id, ResultStatus.LOCKED, 50);
    expect((await record("admin", sub.id, [{ studentId: s.id, score: 60 }])).status).toBe(409);

    expect((await move("admin", [made.id], "DRAFT")).status).toBe(400); // no reason
    expect((await move("admin", [made.id], "DRAFT", "marked against the wrong paper")).status).toBe(200);
    expect((await record("teacher", sub.id, [{ studentId: s.id, score: 60 }])).status).toBe(200);
    expect(Number((await row(made.id)).score)).toBe(60);
  });

  test("a batch with one result past DRAFT writes nothing, wherever that result is in the list", async () => {
    for (const status of [ResultStatus.LOCKED, ResultStatus.PUBLISHED]) {
      const sub = await subject();
      const [first, middle, last] = [await pupil(), await pupil(), await pupil()];
      const draft = await seed(first.id, sub.id, ResultStatus.DRAFT, 40);
      const held = await seed(last.id, sub.id, status, 50);
      const draftBefore = await row(draft.id);
      const heldBefore = await row(held.id);

      const res = await record("teacher", sub.id, [
        { studentId: first.id, score: 90 },
        { studentId: middle.id, score: 90 },
        { studentId: last.id, score: 90 },
      ]);
      expect.soft(res.status, `${status}: ${res.text}`).toBe(409);
      expect(await row(draft.id), `${status}: the draft before it`).toEqual(draftBefore);
      expect(await row(held.id)).toEqual(heldBefore);
      expect(await db.result.count({ where: { studentId: middle.id } }), `${status}: nothing created`).toBe(0);
    }
  });
});

test.describe("a result that moves on while a request is recording it", () => {
  test("is not overwritten: the request waits for the lifecycle step, sees the new status and is refused", async () => {
    const s = await pupil();
    const sub = await subject();
    const made = await seed(s.id, sub.id, ResultStatus.DRAFT, 40);

    let pending!: ReturnType<typeof record>;
    await db.$transaction(
      async (tx) => {
        // the lifecycle moves the result to SUBMITTED, and has not finished yet
        await tx.result.update({ where: { id: made.id }, data: { status: ResultStatus.SUBMITTED } });
        pending = record("teacher", sub.id, [{ studentId: s.id, score: 90 }]);
        // the request reads the result as DRAFT (this step is not visible yet); wait until it is waiting for the row
        await expect
          .poll(
            async () =>
              (await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock'`)[0].n,
            {
              timeout: 10_000,
              message: "the request never waited for the result's row",
            },
          )
          .toBeGreaterThan(0);
      },
      { timeout: 30_000 },
    );

    const res = await pending;
    expect.soft(res.status, res.text).toBe(409);
    const after = await row(made.id);
    expect(after.status).toBe("SUBMITTED");
    expect(Number(after.score)).toBe(40);
  });
});

test.describe("a refused request writes nothing", () => {
  test("a score or a component that is refused late in the batch leaves the earlier entries unwritten", async () => {
    const sub = await subject();
    const [one, two, three] = [await pupil(), await pupil(), await pupil()];

    const over = await record("teacher", sub.id, [
      { studentId: one.id, score: 70 },
      { studentId: two.id, score: 105 },
    ]);
    expect.soft(over.status).toBe(400);
    expect(await db.result.count({ where: { subjectId: sub.id } })).toBe(0);

    const uneven = await record("teacher", sub.id, [
      { studentId: one.id, score: 70 },
      { studentId: three.id, score: 80, components: [{ name: "Examination", score: 50, maxScore: 70 }] },
    ]);
    expect.soft(uneven.status).toBe(400);
    expect(await db.result.count({ where: { subjectId: sub.id } })).toBe(0);
  });

  test("a student who is not in this school is a 404 (never a 500), and the other entries are not written", async () => {
    const sub = await subject();
    const real = await pupil();

    for (const unknown of ["no-such-student", stranger.id]) {
      const res = await record("teacher", sub.id, [
        { studentId: real.id, score: 70 },
        { studentId: unknown, score: 70 },
      ]);
      expect.soft(res.status, `${unknown}: ${res.text}`).toBe(404);
    }
    expect(await db.result.count({ where: { subjectId: sub.id } })).toBe(0);
    expect(await db.result.count({ where: { studentId: stranger.id } })).toBe(0);
  });

  test("a score or a maximum larger than the column holds is a 400, not a 500, and writes nothing", async () => {
    const sub = await subject();
    const [one, two] = [await pupil(), await pupil()];
    const res = await record("teacher", sub.id, [
      { studentId: one.id, score: 70 },
      { studentId: two.id, score: 99999, maxScore: 100000 },
    ]);
    expect.soft(res.status, res.text).toBe(400);
    expect(await db.result.count({ where: { subjectId: sub.id } })).toBe(0);
  });

  test("an id that cannot be an id is a 400, not a database error: a NUL byte in a student, subject, period or result id, in the body or in the query", async () => {
    const sub = await subject();
    const s = await pupil();
    const nul = `a${String.fromCharCode(0)}b`;
    const bodies = [
      { periodId: period.id, subjectId: sub.id, results: [{ studentId: nul, score: 70 }] },
      { periodId: period.id, subjectId: nul, results: [{ studentId: s.id, score: 70 }] },
      { periodId: nul, subjectId: sub.id, results: [{ studentId: s.id, score: 70 }] },
    ];
    for (const body of bodies) {
      const res = await api(resultsRoute(), as("teacher", { method: "POST", body }));
      expect.soft(res.status, JSON.stringify(res.json)).toBe(400);
    }
    expect.soft((await move("admin", [nul], "SUBMITTED")).status, "transition").toBe(400);
    for (const name of ["periodId", "subjectId", "classArmId"]) {
      const res = await api(`${resultsRoute()}?${name}=${encodeURIComponent(nul)}`, as("teacher"));
      expect.soft(res.status, `query ${name}: ${res.text}`).toBe(400);
    }
    expect(await db.result.count({ where: { subjectId: sub.id } })).toBe(0);
  });

  test("a student named twice in one request is a 400 that names the field, and nothing is written", async () => {
    const sub = await subject();
    const [one, two] = [await pupil(), await pupil()];
    const res = await record("teacher", sub.id, [
      { studentId: one.id, score: 70 },
      { studentId: two.id, score: 71 },
      { studentId: one.id, score: 72 },
    ]);
    expect.soft(res.status, res.text).toBe(400);
    expect.soft(res.text).toContain("studentId");
    expect(await db.result.count({ where: { subjectId: sub.id } })).toBe(0);
  });

  test("a parent, and the administrator of another school, cannot record", async () => {
    const sub = await subject();
    const s = await pupil();
    expect((await record("parent", sub.id, [{ studentId: s.id, score: 70 }])).status).toBe(403);
    const other = await record("outsider", sub.id, [{ studentId: s.id, score: 70 }]);
    expect([403, 404]).toContain(other.status);
    expect(await db.result.count({ where: { subjectId: sub.id } })).toBe(0);
  });
});

test.describe("a member anchored to a campus works with that campus's pupils (and those of no campus), as when moving results", () => {
  test("recording: another campus's pupil is a 404 and the batch writes nothing; a school-wide teacher and an administrator are not held", async () => {
    const sub = await subject();
    const [north, south, nobody] = [await pupil(a.campuses[0].id), await pupil(a.campuses[1].id), await pupil(null)];

    const refused = await record("northTeacher", sub.id, [
      { studentId: north.id, score: 70 },
      { studentId: south.id, score: 70 },
    ]);
    expect.soft(refused.status, refused.text).toBe(404);
    expect(await db.result.count({ where: { subjectId: sub.id } })).toBe(0);

    const own = await record("northTeacher", sub.id, [
      { studentId: north.id, score: 70 },
      { studentId: nobody.id, score: 71 },
    ]);
    expect(own.status, own.text).toBe(200);
    expect(await db.result.count({ where: { subjectId: sub.id } })).toBe(2);

    expect((await record("teacher", sub.id, [{ studentId: south.id, score: 72 }])).status).toBe(200);
    expect((await record("admin", sub.id, [{ studentId: south.id, score: 73 }])).status).toBe(200);
  });

  test("listing: a campus member sees their campus's and school-wide pupils' results, a school-wide member sees all", async () => {
    const sub = await subject();
    const [north, south, nobody] = [await pupil(a.campuses[0].id), await pupil(a.campuses[1].id), await pupil(null)];
    for (const s of [north, south, nobody]) await seed(s.id, sub.id, ResultStatus.DRAFT, 60);

    const ids = async (who: string) => {
      const res = await list(who, sub.id);
      expect(res.status, `${who}: ${res.text}`).toBe(200);
      return (res.json.data.results as Array<{ studentId: string }>).map((r) => r.studentId).sort();
    };
    const mine = [north.id, nobody.id].sort();
    expect(await ids("northTeacher")).toEqual(mine);
    expect(await ids("northClerk")).toEqual(mine);
    expect(await ids("teacher")).toEqual([north.id, south.id, nobody.id].sort());
    expect(await ids("admin")).toEqual([north.id, south.id, nobody.id].sort());
  });
});

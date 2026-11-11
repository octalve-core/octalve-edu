import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
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
import { Permission, ResultStatus } from "@prisma/client";
import { api, cookieHeader, loginAs, type ApiResponse } from "../support/http";

// A campus administrator and Results (task 0046, decision D7 of task 0031; ADR 0016 and ADR 0018) over real HTTP. They work on their OWN campus: they read the pupils and classes of their campus and
// the school's, enter marks, import them and write the teacher's remark only for pupils on the roll of a class of their own campus, and they approve and publish only with the permission and a scope.
// Another campus's pupil, class or result is the 404 of an unknown id; a class of the whole school is visible but not theirs to enter marks for (403). An administrator is not changed.
//
// School A has two campuses, North and South. Its classes: Form 1 (the whole school), Form 1 North, Form 1 South. Pupils: one in each class, and a "wide-in-north" pupil who belongs to no campus
// but is on the roll of the North class.

test.describe.configure({ mode: "serial" });

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
let north: string;
let south: string;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
let counter = 0;
const uniq = (p: string) => `${p}${Date.now().toString(36)}${++counter}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const base = (code = a.code) => `/api/v1/schools/${code}/academics/results`;

let sessionId: string;
let periodId: string;
let southPeriodId: string; // a term of a session that belongs to the South campus alone
let wideArm: string;
let northArm: string;
let southArm: string;
let maths: string;
const pupils: Record<string, { id: string; adm: string }> = {};

async function pupil(key: string, armId: string, over: Record<string, unknown> = {}) {
  const record = await db.studentRecord.create({
    data: { tenantId: a.id, firstName: key, lastName: "Campus", dateOfBirth: day("2014-01-01"), admissionNo: uniq("CA/"), ...over },
  });
  await db.studentEnrollment.create({ data: { tenantId: a.id, studentId: record.id, sessionId, classArmId: armId } });
  pupils[key] = { id: record.id, adm: record.admissionNo };
  return record.id;
}

const record = (who: string, studentIds: string[], over: Record<string, unknown> = {}) =>
  api(base(), {
    ...as(who),
    method: "POST",
    body: { periodId, subjectId: maths, results: studentIds.map((studentId) => ({ studentId, score: 61 })), ...over },
  });
const resultRows = (studentId: string) => db.result.findMany({ where: { tenantId: a.id, studentId } });
const transition = (who: string, resultIds: string[], toStatus: string, reason?: string) =>
  api(`${base()}/transition`, { ...as(who), method: "POST", body: { resultIds, toStatus, ...(reason ? { reason } : {}) } });
const idsOf = async (...keys: string[]) =>
  (await db.result.findMany({ where: { tenantId: a.id, studentId: { in: keys.map((k) => pupils[k].id) } } })).map((r) => r.id);
const forbidden = (res: ApiResponse, why: string) => {
  expect(res.status, `${why}: ${res.status} ${res.text.slice(0, 160)}`).toBe(403);
};

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Campus Results School", campuses: ["North", "South"] });
  b = await createTenant({ name: "Other Campus Results School" });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  for (const who of ["admin", "northAdmin", "northApprover", "southAdmin", "teacher", "adminB", "otherSchoolCampusAdmin"])
    people[who] = await createUser({ name: who });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.northAdmin.id, a.id, Role.CAMPUS_ADMIN, north);
  // A campus administrator cannot hold CAN_APPROVE_RESULTS (the database allows permissions only on the two staff roles), so the approver of North's results is a teacher of that campus.
  await db.tenantMembership.create({
    data: {
      userId: people.northApprover.id,
      tenantId: a.id,
      role: Role.TEACHING_STAFF,
      campusId: north,
      permissions: [Permission.CAN_APPROVE_RESULTS],
    },
  });
  await grantApprovalScope(people.northApprover.id, a.id, { kind: "GENERAL" });
  await addMembership(people.southAdmin.id, a.id, Role.CAMPUS_ADMIN, south);
  await addMembership(people.teacher.id, a.id, Role.TEACHING_STAFF, null);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  await addMembership(people.otherSchoolCampusAdmin.id, b.id, Role.CAMPUS_ADMIN, b.campuses[0].id);
  for (const who of Object.keys(people)) cookie[who] = cookieHeader((await loginAs(people[who], SAAS)).token!);

  sessionId = (
    await db.academicSession.create({
      data: { tenantId: a.id, label: "2036/2037", startDate: day("2036-09-01"), endDate: day("2037-07-20"), status: "ACTIVE" },
    })
  ).id;
  periodId = (
    await db.academicPeriod.create({
      data: {
        tenantId: a.id,
        sessionId,
        kind: "TERM",
        ordinal: 1,
        label: "First Term",
        startDate: day("2036-09-01"),
        endDate: day("2036-12-15"),
        isCurrent: true,
      },
    })
  ).id;
  const southSession = await db.academicSession.create({
    data: {
      tenantId: a.id,
      label: "2036/2037 South",
      startDate: day("2036-09-01"),
      endDate: day("2037-07-20"),
      status: "PLANNED",
      campusId: south,
    },
  });
  southPeriodId = (
    await db.academicPeriod.create({
      data: {
        tenantId: a.id,
        sessionId: southSession.id,
        kind: "TERM",
        ordinal: 1,
        label: "South First Term",
        startDate: day("2036-09-01"),
        endDate: day("2036-12-15"),
      },
    })
  ).id;
  const wideGroup = await db.classGroup.create({ data: { tenantId: a.id, name: "Form 1", sortOrder: 1 } });
  const northGroup = await db.classGroup.create({ data: { tenantId: a.id, name: "Form 1 North", sortOrder: 2, campusId: north } });
  const southGroup = await db.classGroup.create({ data: { tenantId: a.id, name: "Form 1 South", sortOrder: 3, campusId: south } });
  wideArm = (await db.classArm.create({ data: { tenantId: a.id, classGroupId: wideGroup.id, name: "A" } })).id;
  northArm = (await db.classArm.create({ data: { tenantId: a.id, classGroupId: northGroup.id, name: "N" } })).id;
  southArm = (await db.classArm.create({ data: { tenantId: a.id, classGroupId: southGroup.id, name: "S" } })).id;
  maths = (await db.subject.create({ data: { tenantId: a.id, name: "Mathematics" } })).id;
  for (const g of [wideGroup.id, northGroup.id, southGroup.id])
    await db.subjectOffering.create({ data: { tenantId: a.id, classGroupId: g, subjectId: maths } });

  await pupil("northPupil", northArm, { campusId: north });
  await pupil("northPupil2", northArm, { campusId: north });
  await pupil("widePupilInNorth", northArm); // belongs to no campus, on the roll of the North class
  await pupil("southPupil", southArm, { campusId: south });
  await pupil("widePupil", wideArm); // a class of the whole school
  await pupil("northPupilInWide", wideArm, { campusId: north }); // a North pupil in a class of the whole school
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("entering marks", () => {
  test("a campus administrator enters marks for pupils on the roll of a class of their own campus, a pupil of no campus included; the rows are theirs", async () => {
    const res = await record("northAdmin", [pupils.northPupil.id, pupils.widePupilInNorth.id]);
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.json.data.count).toBe(2);
    const rows = [...(await resultRows(pupils.northPupil.id)), ...(await resultRows(pupils.widePupilInNorth.id))];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe(ResultStatus.DRAFT);
      expect(row.enteredByStaffId).toBe(people.northAdmin.id);
    }
  });

  test("a pupil of another campus is the 404 of an unknown id, and a request that names one writes nothing, even for the pupils it also names of the administrator's own campus", async () => {
    const before = await db.result.count({ where: { tenantId: a.id } });
    const res = await record("northAdmin", [pupils.northPupil2.id, pupils.southPupil.id]);
    expect(res.status, res.text.slice(0, 200)).toBe(404);
    expect(await db.result.count({ where: { tenantId: a.id } })).toBe(before);
    expect(await resultRows(pupils.northPupil2.id)).toHaveLength(0);
  });

  test("a pupil in a class of the whole school is not theirs to enter marks for (403), whether the pupil belongs to no campus or to their own; nothing is written", async () => {
    const before = await db.result.count({ where: { tenantId: a.id } });
    forbidden(await record("northAdmin", [pupils.widePupil.id]), "a pupil of the whole school's class");
    forbidden(await record("northAdmin", [pupils.northPupilInWide.id]), "their own campus's pupil, but in a class of the whole school");
    forbidden(await record("northAdmin", [pupils.northPupil2.id, pupils.widePupil.id]), "a mixed request");
    expect(await db.result.count({ where: { tenantId: a.id } })).toBe(before);
  });

  test("a term of another campus's own session is the 404 of an unknown id", async () => {
    const res = await record("northAdmin", [pupils.northPupil2.id], { periodId: southPeriodId });
    expect(res.status, res.text.slice(0, 200)).toBe(404);
    expect(await resultRows(pupils.northPupil2.id)).toHaveLength(0);
  });

  test("the school's administrator is unchanged: any campus, the whole school's classes too", async () => {
    const res = await record("admin", [pupils.southPupil.id, pupils.widePupil.id, pupils.northPupil2.id]);
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.json.data.count).toBe(3);
  });

  test("a campus administrator of another school, and a campus administrator of South for a North pupil, get nothing", async () => {
    expect((await record("otherSchoolCampusAdmin", [pupils.northPupil.id])).status).toBe(403); // not a member of this school
    expect((await record("southAdmin", [pupils.northPupil.id])).status).toBe(404);
  });
});

test.describe("reading", () => {
  test("the results list shows a campus administrator their campus's pupils' results and the school's, never another campus's", async () => {
    const res = await api(`${base()}?periodId=${periodId}`, as("northAdmin"));
    expect(res.status).toBe(200);
    const students = new Set((res.json.data.results as { studentId: string }[]).map((r) => r.studentId));
    expect(students.has(pupils.northPupil.id)).toBe(true);
    expect(students.has(pupils.widePupil.id)).toBe(true);
    expect(students.has(pupils.southPupil.id)).toBe(false);
  });

  test("the options offer entry only for the classes of their own campus, and read every class of their campus and of the school", async () => {
    const res = await api(`${base()}/options`, as("northAdmin"));
    expect(res.status).toBe(200);
    const pairs = res.json.data.pairs as { classArmId: string }[];
    expect(new Set(pairs.map((p) => p.classArmId))).toEqual(new Set([northArm]));
    expect(new Set((res.json.data.arms as { id: string }[]).map((x) => x.id))).toEqual(new Set([wideArm, northArm]));
    // The school's administrator is offered every class.
    const all = await api(`${base()}/options`, as("admin"));
    expect(new Set((all.json.data.pairs as { classArmId: string }[]).map((p) => p.classArmId))).toEqual(
      new Set([wideArm, northArm, southArm]),
    );
  });

  test("the marks sheet and the class list: own campus 200, the school's class listed but not enterable, another campus 404", async () => {
    const q = (arm: string) => `periodId=${periodId}&classArmId=${arm}`;
    expect((await api(`${base()}/sheet?${q(northArm)}&subjectId=${maths}`, as("northAdmin"))).status).toBe(200);
    forbidden(await api(`${base()}/sheet?${q(wideArm)}&subjectId=${maths}`, as("northAdmin")), "the sheet of a class of the whole school");
    expect((await api(`${base()}/sheet?${q(southArm)}&subjectId=${maths}`, as("northAdmin"))).status).toBe(404);
    expect((await api(`${base()}/roster?${q(northArm)}`, as("northAdmin"))).status).toBe(200);
    expect((await api(`${base()}/roster?${q(wideArm)}`, as("northAdmin"))).status).toBe(200);
    expect((await api(`${base()}/roster?${q(southArm)}`, as("northAdmin"))).status).toBe(404);
    // A term of a session that belongs to another campus alone is the 404 of an unknown id, for the roster and the sheet alike.
    expect((await api(`${base()}/roster?periodId=${southPeriodId}&classArmId=${northArm}`, as("northAdmin"))).status).toBe(404);
    expect(
      (await api(`${base()}/sheet?periodId=${southPeriodId}&classArmId=${northArm}&subjectId=${maths}`, as("northAdmin"))).status,
    ).toBe(404);
  });
});

test.describe("importing marks", () => {
  const csv = (adm: string, mark: number) => `admission_no,Mark (100)\r\n${adm},${mark}\r\n`;
  const imp = (who: string, arm: string, text: string, dryRun = false) =>
    api(`${base()}/import`, { ...as(who), method: "POST", body: { periodId, classArmId: arm, subjectId: maths, csv: text, dryRun } });

  test("a campus administrator imports marks for a class of their own campus; a class of the whole school is 403 and another campus's is 404; nothing is written", async () => {
    const ok = await imp("northAdmin", northArm, csv(pupils.northPupil2.adm, 44));
    expect(ok.status, ok.text.slice(0, 200)).toBe(200);
    expect(ok.json.data.report.committed).toBe(true);
    const saved = (await resultRows(pupils.northPupil2.id)).find((r) => Number(r.score) === 44);
    expect(saved, "the imported mark is saved").toBeDefined();
    const before = await db.result.count({ where: { tenantId: a.id } });
    forbidden(await imp("northAdmin", wideArm, csv(pupils.widePupil.adm, 10)), "a class of the whole school");
    expect((await imp("northAdmin", southArm, csv(pupils.southPupil.adm, 10))).status).toBe(404);
    expect(await db.result.count({ where: { tenantId: a.id } })).toBe(before);
  });

  test("the template follows the same rule", async () => {
    const q = (arm: string) => `periodId=${periodId}&classArmId=${arm}&subjectId=${maths}`;
    expect((await api(`${base()}/import-template?${q(northArm)}`, as("northAdmin"))).status).toBe(200);
    forbidden(await api(`${base()}/import-template?${q(wideArm)}`, as("northAdmin")), "template of a class of the whole school");
    expect((await api(`${base()}/import-template?${q(southArm)}`, as("northAdmin"))).status).toBe(404);
  });
});

test.describe("the review lifecycle", () => {
  test("a campus administrator cannot hold the approval permission at all (the database refuses it), so approving and publishing are the school administrator's and the named approvers'", async () => {
    const user = await createUser({ name: "wants-approval" });
    await expect(
      db.tenantMembership.create({
        data: { userId: user.id, tenantId: a.id, role: Role.CAMPUS_ADMIN, campusId: north, permissions: [Permission.CAN_APPROVE_RESULTS] },
      }),
    ).rejects.toThrow();
  });

  test("a campus administrator sends their own marks for review and cannot approve them (403)", async () => {
    await db.result.deleteMany({ where: { tenantId: a.id, studentId: pupils.northPupil.id } });
    expect((await record("northAdmin", [pupils.northPupil.id])).status).toBe(200);
    const ids = await idsOf("northPupil");
    expect((await transition("northAdmin", ids, "SUBMITTED")).status).toBe(200);
    forbidden(await transition("northAdmin", ids, "APPROVED"), "approving without CAN_APPROVE_RESULTS");
    expect((await db.result.findFirstOrThrow({ where: { id: ids[0] } })).status).toBe(ResultStatus.SUBMITTED);
  });

  test("an approver of the campus (a teacher with the permission and a scope) approves and publishes what the campus administrator entered, and cannot reach another campus's results", async () => {
    const ids = await idsOf("northPupil");
    expect((await transition("northApprover", ids, "APPROVED")).status).toBe(200);
    expect((await transition("northApprover", ids, "PUBLISHED")).status).toBe(200);
    // A South result: entered by the school administrator, out of the North approver's reach.
    const southIds = await idsOf("southPupil");
    expect(southIds.length).toBeGreaterThan(0);
    expect((await transition("northApprover", southIds, "SUBMITTED")).status).toBe(404);
    expect((await transition("northApprover", [...ids, ...southIds], "LOCKED")).status).toBe(404);
  });

  test("a LOCKED result is unlocked by the school's administrator alone, not by a campus administrator nor by an approver", async () => {
    const ids = await idsOf("northPupil");
    expect((await transition("northApprover", ids, "LOCKED")).status).toBe(200);
    forbidden(await transition("northAdmin", ids, "DRAFT", "a campus administrator trying"), "unlocking by a campus administrator");
    forbidden(await transition("northApprover", ids, "DRAFT", "an approver trying"), "unlocking by an approver");
    expect((await transition("admin", ids, "DRAFT", "the school administrator corrects a mark")).status).toBe(200);
  });
});

test.describe("report cards and remarks", () => {
  const card = (who: string, key: string, path = "") =>
    api(`/api/v1/schools/${a.code}/people/students/${pupils[key].id}/report-card${path}?periodId=${periodId}`, as(who));
  const remark = (who: string, key: string, body: Record<string, unknown>) =>
    api(`/api/v1/schools/${a.code}/people/students/${pupils[key].id}/report-remarks`, {
      ...as(who),
      method: "PUT",
      body: { periodId, ...body },
    });

  test("the card and its PDF: a pupil of their campus or of no campus reads; another campus's is the 404 of an unknown id", async () => {
    for (const path of ["", "/pdf"]) {
      expect((await card("northAdmin", "northPupil2", path)).status, `card${path} own campus`).toBe(200);
      expect((await card("northAdmin", "widePupilInNorth", path)).status, `card${path} no campus`).toBe(200);
      expect((await card("northAdmin", "southPupil", path)).status, `card${path} other campus`).toBe(404);
      expect((await card("southAdmin", "northPupil2", path)).status, `card${path} South reading North`).toBe(404);
    }
  });

  test("the card tells a campus administrator they may write the teacher's remark and not the principal's, for a class of their own campus only", async () => {
    const own = (await card("northAdmin", "northPupil2")).json.data.remarks;
    expect(own).toMatchObject({ canWriteTeacher: true, canWritePrincipal: false });
    const wide = (await card("northAdmin", "widePupil")).json.data.remarks;
    expect(wide).toMatchObject({ canWriteTeacher: false, canWritePrincipal: false });
  });

  test("the teacher's remark: written for a pupil of their own campus's class; the principal's is the school administrator's alone; a class of the whole school is 403; another campus's is 404", async () => {
    const ok = await remark("northAdmin", "northPupil2", { teacherRemark: "Works steadily." });
    expect(ok.status, ok.text.slice(0, 200)).toBe(200);
    expect(ok.json.data.remarks.teacherRemark).toBe("Works steadily.");
    forbidden(await remark("northAdmin", "northPupil2", { principalRemark: "Promoted." }), "the principal's remark");
    // The sentence says whose the pupil is, not that the administrator lacks a right they have for their own campus's pupils.
    for (const key of ["widePupil", "northPupilInWide"]) {
      const res = await remark("northAdmin", key, { teacherRemark: "x" });
      forbidden(res, `${key}: a pupil of a class of the whole school`);
      expect(res.json.error.message, key).toMatch(/whole school or to another campus/);
    }
    expect((await remark("northAdmin", "southPupil", { teacherRemark: "x" })).status).toBe(404);
    forbidden(await remark("otherSchoolCampusAdmin", "northPupil2", { teacherRemark: "x" }), "not a member of this school");
    // The school's administrator writes both, as before.
    expect((await remark("admin", "northPupil2", { principalRemark: "Promoted." })).status).toBe(200);
  });
});

test.describe("who is still shut out", () => {
  test("signed out, a pupil's account and another school's administrator reach none of it; a teacher with no assignment still enters nothing", async () => {
    expect((await api(`${base()}/options`, SAAS)).status).toBe(401);
    expect((await api(`${base()}/options`, as("adminB"))).status).toBe(403);
    expect((await record("teacher", [pupils.northPupil2.id])).status).toBe(403);
  });
});

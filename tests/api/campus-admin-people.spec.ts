import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import {
  Role,
  addMembership,
  createTenant,
  createUser,
  db,
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// A campus administrator and PEOPLE over real HTTP (plan C1-C4, ADR 0016): they manage the students, staff and guardians of THEIR campus and
// nobody else's. For every kind of record: own campus works; another campus is a 404, the same as an unknown id; a school-wide record (they can
// see it, it belongs to the whole school) is a 403; a new record defaults to their campus and cannot be put anywhere else. An ADMIN is unchanged.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let admin: TestUser;
let campusAdmin: TestUser; // CAMPUS_ADMIN of North
let teacher: TestUser;
const cookie: Record<string, string> = {};
let north: string;
let south: string;

const people = () => `/api/v1/schools/${a.code}/people`;
const as = (who: string, extra: object = {}) => ({ ...SAAS, cookie: cookie[who], ...extra });
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
async function cookieFor(user: TestUser) {
  const res = await loginAs(user, SAAS);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}
const student = (campusId: string | null) =>
  db.studentRecord.create({
    data: {
      tenantId: a.id,
      campusId,
      firstName: uniq("Pupil"),
      lastName: "Scope",
      dateOfBirth: new Date("2011-03-04"),
      admissionNo: uniq("CS/"),
    },
  });
const staff = (campusId: string | null, email: string | null = null) =>
  db.staffRecord.create({ data: { tenantId: a.id, campusId, category: "TEACHING", firstName: uniq("Staff"), lastName: "Scope", email } });
const guardian = () => db.guardianRecord.create({ data: { tenantId: a.id, firstName: uniq("Guard"), lastName: "Scope" } });
const link = (studentId: string, guardianId: string) =>
  db.guardianLink.create({ data: { tenantId: a.id, studentId, guardianId, relationship: "GUARDIAN", isPrimary: false } });

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Campus Scope School", campuses: ["North", "South"] });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  [admin, campusAdmin, teacher] = await Promise.all(["Ada Admin", "Cam Campusadmin", "Tola Teacher"].map((name) => createUser({ name })));
  await addMembership(admin.id, a.id, Role.ADMIN);
  await addMembership(campusAdmin.id, a.id, Role.CAMPUS_ADMIN, north);
  await addMembership(teacher.id, a.id, Role.TEACHING_STAFF, north);
  for (const [who, user] of Object.entries({ admin, campusAdmin, teacher })) cookie[who] = await cookieFor(user);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("reading", () => {
  test("a campus administrator sees their campus's students and staff plus the school-wide ones, not another campus's", async () => {
    const [n, s, w] = [await student(north), await student(south), await student(null)];
    const ids = ((await api(`${people()}/students?limit=100`, as("campusAdmin"))).json.data.students as { id: string }[]).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining([n.id, w.id]));
    expect(ids).not.toContain(s.id);
    const [sn, ss] = [await staff(north), await staff(south)];
    const staffIds = ((await api(`${people()}/staff?limit=100`, as("campusAdmin"))).json.data.staff as { id: string }[]).map((x) => x.id);
    expect(staffIds).toContain(sn.id);
    expect(staffIds).not.toContain(ss.id);
    expect((await api(`${people()}/students/${s.id}`, as("campusAdmin"))).status).toBe(404);
  });
});

test.describe("students", () => {
  const body = (over: Record<string, unknown> = {}) => ({ firstName: uniq("Sade"), lastName: "Okoro", dateOfBirth: "2012-05-01", ...over });

  test("a new student defaults to the campus administrator's campus; another campus, or none, is a 403; an ADMIN is unchanged", async () => {
    const made = await api(`${people()}/students`, as("campusAdmin", { method: "POST", body: body() }));
    expect(made.status).toBe(201);
    expect((await db.studentRecord.findUniqueOrThrow({ where: { id: made.json.data.student.id } })).campusId).toBe(north);
    expect((await api(`${people()}/students`, as("campusAdmin", { method: "POST", body: body({ campusId: south }) }))).status).toBe(403);
    expect((await api(`${people()}/students`, as("campusAdmin", { method: "POST", body: body({ campusId: null }) }))).status).toBe(403);
    expect((await api(`${people()}/students`, as("admin", { method: "POST", body: body({ campusId: south }) }))).status).toBe(201);
    expect((await api(`${people()}/students`, as("teacher", { method: "POST", body: body() }))).status).toBe(403);
  });

  test("update, archive and restore: own campus works; another campus is the same 404 as an unknown id; a school-wide student is 403", async () => {
    const [mine, theirs, wide] = [await student(north), await student(south), await student(null)];
    expect(
      (await api(`${people()}/students/${mine.id}`, as("campusAdmin", { method: "PATCH", body: { firstName: "Changed" } }))).status,
    ).toBe(200);
    expect((await api(`${people()}/students/${mine.id}/archive`, as("campusAdmin", { method: "POST", body: {} }))).status).toBe(200);
    expect((await api(`${people()}/students/${mine.id}/restore`, as("campusAdmin", { method: "POST", body: {} }))).status).toBe(200);

    const unknown = await api(
      `${people()}/students/no-such-student`,
      as("campusAdmin", { method: "PATCH", body: { firstName: "Changed" } }),
    );
    for (const [path, method, payload] of [
      [`${theirs.id}`, "PATCH", { firstName: "Hacked" }],
      [`${theirs.id}/archive`, "POST", {}],
      [`${theirs.id}/restore`, "POST", {}],
    ] as const) {
      const res = await api(`${people()}/students/${path}`, as("campusAdmin", { method, body: payload }));
      expect([res.status, path], path).toEqual([404, path]);
      expect(res.json.error.code).toBe(unknown.json.error.code);
    }
    expect((await db.studentRecord.findUniqueOrThrow({ where: { id: theirs.id } })).firstName).toBe(theirs.firstName);
    for (const [path, method, payload] of [
      [`${wide.id}`, "PATCH", { firstName: "Hacked" }],
      [`${wide.id}/archive`, "POST", {}],
    ] as const) {
      expect((await api(`${people()}/students/${path}`, as("campusAdmin", { method, body: payload }))).status, path).toBe(403);
    }
    expect((await db.studentRecord.findUniqueOrThrow({ where: { id: wide.id } })).archivedAt).toBeNull();
    expect(
      (await api(`${people()}/students/${theirs.id}`, as("admin", { method: "PATCH", body: { firstName: "Admin edit" } }))).status,
    ).toBe(200);
  });

  test("guardian links and enrolments follow the student's campus", async () => {
    const [mine, theirs] = [await student(north), await student(south)];
    const g = await guardian();
    const linkRes = await api(
      `${people()}/students/${mine.id}/guardians`,
      as("campusAdmin", { method: "POST", body: { guardianId: g.id, relationship: "GUARDIAN" } }),
    );
    expect(linkRes.status).toBe(201);
    expect(
      (
        await api(
          `${people()}/students/${theirs.id}/guardians`,
          as("campusAdmin", { method: "POST", body: { guardianId: g.id, relationship: "GUARDIAN" } }),
        )
      ).status,
    ).toBe(404);
    const session = await db.academicSession.create({
      data: {
        tenantId: a.id,
        campusId: north,
        label: uniq("S"),
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-31"),
        status: "ACTIVE",
      },
    });
    const group = await db.classGroup.create({ data: { tenantId: a.id, campusId: north, name: uniq("Grp") } });
    const arm = await db.classArm.create({ data: { tenantId: a.id, classGroupId: group.id, name: "A", capacity: 5 } });
    expect(
      (
        await api(
          `${people()}/students/${mine.id}/enrolments`,
          as("campusAdmin", { method: "POST", body: { sessionId: session.id, classArmId: arm.id } }),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await api(
          `${people()}/students/${theirs.id}/enrolments`,
          as("campusAdmin", { method: "POST", body: { sessionId: session.id, classArmId: arm.id } }),
        )
      ).status,
    ).toBe(404);
  });

  test("import: rows without a campus go to their campus; a row naming another campus is refused; nothing is written then", async () => {
    const csv = (row: string) => `first_name,last_name,date_of_birth,campus\n${row}\n`;
    const ok = await api(
      `${people()}/students/import`,
      as("campusAdmin", { method: "POST", body: { csv: csv(`${uniq("Imp")},Mine,2013-01-01,`), dryRun: false } }),
    );
    expect(ok.status).toBe(200);
    const stray = await api(
      `${people()}/students/import`,
      as("campusAdmin", { method: "POST", body: { csv: csv(`${uniq("Imp")},Theirs,2013-01-01,South`), dryRun: false } }),
    );
    expect(stray.status).toBe(200);
    expect(stray.json.data.report).toMatchObject({ committed: false, counts: { errors: 1, created: 0 } });
    expect(JSON.stringify(stray.json.data.report.rows)).toContain("own campus");
    expect(await db.studentRecord.count({ where: { tenantId: a.id, lastName: "Theirs" } })).toBe(0);
    expect((await db.studentRecord.findFirstOrThrow({ where: { tenantId: a.id, lastName: "Mine" } })).campusId).toBe(north);
  });
});

test.describe("staff", () => {
  test("create defaults to their campus; another campus or none is 403; update/archive/restore/invite follow the record's campus", async () => {
    const body = (over: Record<string, unknown> = {}) => ({ category: "TEACHING", firstName: uniq("Tea"), lastName: "Cher", ...over });
    const made = await api(`${people()}/staff`, as("campusAdmin", { method: "POST", body: body() }));
    expect(made.status).toBe(201);
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: made.json.data.staff.id } })).campusId).toBe(north);
    expect((await api(`${people()}/staff`, as("campusAdmin", { method: "POST", body: body({ campusId: south }) }))).status).toBe(403);
    expect((await api(`${people()}/staff`, as("campusAdmin", { method: "POST", body: body({ campusId: null }) }))).status).toBe(403);

    const [mine, theirs, wide] = [await staff(north), await staff(south), await staff(null)];
    expect((await api(`${people()}/staff/${mine.id}`, as("campusAdmin", { method: "PATCH", body: { firstName: "Changed" } }))).status).toBe(
      200,
    );
    expect((await api(`${people()}/staff/${mine.id}/archive`, as("campusAdmin", { method: "POST", body: {} }))).status).toBe(200);
    expect((await api(`${people()}/staff/${mine.id}/restore`, as("campusAdmin", { method: "POST", body: {} }))).status).toBe(200);
    for (const path of [`${theirs.id}`, `${theirs.id}/archive`, `${theirs.id}/invite`]) {
      const method = path === theirs.id ? "PATCH" : "POST";
      const res = await api(
        `${people()}/staff/${path}`,
        as("campusAdmin", { method, body: method === "PATCH" ? { firstName: "Hacked" } : {} }),
      );
      expect(res.status, path).toBe(404);
    }
    for (const path of [`${wide.id}`, `${wide.id}/archive`]) {
      const method = path === wide.id ? "PATCH" : "POST";
      const res = await api(
        `${people()}/staff/${path}`,
        as("campusAdmin", { method, body: method === "PATCH" ? { firstName: "Hacked" } : {} }),
      );
      expect(res.status, path).toBe(403);
    }
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: theirs.id } })).firstName).toBe(theirs.firstName);
  });

  test("inviting staff from a record of their campus is allowed and never makes an administrator", async () => {
    const mine = await staff(north, `${uniq("inv")}@scope.test`);
    const res = await api(`${people()}/staff/${mine.id}/invite`, as("campusAdmin", { method: "POST", body: {} }));
    expect(res.status).toBe(201);
    const invitation = await db.invitation.findFirstOrThrow({ where: { tenantId: a.id, email: mine.email! } });
    expect(invitation).toMatchObject({ role: "TEACHING_STAFF", campusId: north });
  });
});

test.describe("guardians", () => {
  test("edit a guardian linked to a student of their campus; one linked only to another campus (or to no one) is a 404", async () => {
    const [mineStudent, theirStudent] = [await student(north), await student(south)];
    const [mine, theirs, loose] = [await guardian(), await guardian(), await guardian()];
    await link(mineStudent.id, mine.id);
    await link(theirStudent.id, theirs.id);
    expect(
      (await api(`${people()}/guardians/${mine.id}`, as("campusAdmin", { method: "PATCH", body: { firstName: "Changed" } }))).status,
    ).toBe(200);
    for (const id of [theirs.id, loose.id]) {
      expect(
        (await api(`${people()}/guardians/${id}`, as("campusAdmin", { method: "PATCH", body: { firstName: "Hacked" } }))).status,
        id,
      ).toBe(404);
      expect((await api(`${people()}/guardians/${id}/archive`, as("campusAdmin", { method: "POST", body: {} }))).status, id).toBe(404);
    }
    expect((await db.guardianRecord.findUniqueOrThrow({ where: { id: theirs.id } })).firstName).toBe(theirs.firstName);
    expect(
      (await api(`${people()}/guardians/${theirs.id}`, as("admin", { method: "PATCH", body: { firstName: "Admin edit" } }))).status,
    ).toBe(200);
  });
});

test.describe("what stays with the school", () => {
  test("a campus administrator is refused the school-only routes: settings, creating a campus, members (until their slice), fee structures", async () => {
    const base = `/api/v1/schools/${a.code}`;
    const attempts: [string, string, unknown][] = [
      ["PATCH", `${base}/settings`, { name: "Hijacked" }],
      ["POST", `${base}/campuses`, { name: "Third campus" }],
      ["GET", `${base}/members`, undefined],
      ["POST", `${base}/finance/fee-structures`, {}],
    ];
    for (const [method, url, payload] of attempts) {
      const res = await api(url, as("campusAdmin", { method, body: payload }));
      expect(res.status, `${method} ${url}`).toBe(403);
    }
    expect((await db.tenant.findUniqueOrThrow({ where: { id: a.id } })).name).toBe("Campus Scope School");
  });
});

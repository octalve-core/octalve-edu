import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Permission, ResultStatus, UnsectionedClassApproval } from "@prisma/client";
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

// ADR 0018, amendment of 2026-10-23: whether an approver with a SECTION scope may also act on the class groups that have no section is a school setting,
// `unsectionedClassApproval`. GENERAL_OR_CLASS_ONLY (the default) reaches such a class group only through a GENERAL scope or a CLASS scope on it; ANY_SECTION_APPROVER also gives
// it to a person with a live SECTION scope in the same campus. It never crosses campuses, never gives anything to a person with no scope, and an archived section widens nothing.
//
// The school has two campuses, North and South. North: section Junior (JSS 1), and JSS 2 in no section. South: section Senior (SSS 1), and Primary 1 in no section. One pupil is on the
// roll of each arm, with one SUBMITTED result.

const SAAS = { baseUrl: SAAS_URL };

let a: TestTenant;
let admin: TestUser;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
let junior: { id: string };
let senior: { id: string };
let groups: Record<"jss1" | "jss2" | "sss1" | "pri1", { id: string }>;
let result: Record<"jss1" | "jss2" | "sss1" | "pri1", string>;
let n = 0;

const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const base = () => `/api/v1/schools/${a.code}`;
const list = async (who: string) => {
  const res = await api(`${base()}/academics/results`, as(who));
  expect(res.status, `${who}: ${res.text}`).toBe(200);
  return (res.json.data.results as Array<{ id: string }>).map((row) => row.id).sort();
};
const approve = (who: string, resultIds: string[]) =>
  api(`${base()}/academics/results/transition`, { ...as(who), method: "POST", body: { resultIds, toStatus: ResultStatus.APPROVED } });
const setting = (value: UnsectionedClassApproval) =>
  db.schoolSettings.update({ where: { tenantId: a.id }, data: { unsectionedClassApproval: value } });
const sorted = (ids: string[]) => [...ids].sort();

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Unsectioned Classes", campuses: ["North", "South"] });
  const [north, south] = a.campuses;

  for (const key of ["northSection", "southSection", "classOnly", "general", "noScope", "archivedOnly"]) people[key] = await createUser();
  admin = await createUser();
  await addMembership(admin.id, a.id, Role.ADMIN);
  for (const key of ["northSection", "southSection", "classOnly", "general", "noScope", "archivedOnly"]) {
    await db.tenantMembership.create({
      data: { userId: people[key].id, tenantId: a.id, role: Role.TEACHING_STAFF, permissions: [Permission.CAN_APPROVE_RESULTS] },
    });
  }

  const session = await db.academicSession.create({
    data: { tenantId: a.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const period = await db.academicPeriod.create({
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
  const maths = await db.subject.create({ data: { tenantId: a.id, name: "Mathematics", code: "MUS1" } });
  junior = await db.section.create({ data: { tenantId: a.id, campusId: north.id, name: "Junior", sortOrder: 1 } });
  senior = await db.section.create({ data: { tenantId: a.id, campusId: south.id, name: "Senior", sortOrder: 2 } });
  const archived = await db.section.create({
    data: { tenantId: a.id, campusId: north.id, name: "Old section", sortOrder: 3, archivedAt: new Date() },
  });
  const group = (name: string, sortOrder: number, campusId: string, sectionId?: string) =>
    db.classGroup.create({ data: { tenantId: a.id, campusId, name, sortOrder, ...(sectionId ? { sectionId } : {}) } });
  groups = {
    jss1: await group("JSS 1", 1, north.id, junior.id),
    jss2: await group("JSS 2", 2, north.id),
    sss1: await group("SSS 1", 3, south.id, senior.id),
    pri1: await group("Primary 1", 0, south.id),
  };
  const arms = {} as Record<keyof typeof groups, { id: string }>;
  for (const key of Object.keys(groups) as Array<keyof typeof groups>)
    arms[key] = await db.classArm.create({ data: { tenantId: a.id, classGroupId: groups[key].id, name: "A" } });

  await grantApprovalScope(people.northSection.id, a.id, { kind: "SECTION", sectionId: junior.id });
  await grantApprovalScope(people.southSection.id, a.id, { kind: "SECTION", sectionId: senior.id });
  await grantApprovalScope(people.classOnly.id, a.id, { kind: "CLASS", classGroupId: groups.jss1.id });
  await grantApprovalScope(people.general.id, a.id);
  await grantApprovalScope(people.archivedOnly.id, a.id, { kind: "SECTION", sectionId: archived.id });

  const pupil = async (label: string, armId: string) => {
    n += 1;
    const student = await db.studentRecord.create({
      data: {
        tenantId: a.id,
        firstName: label,
        lastName: "Unsectioned",
        dateOfBirth: new Date("2013-03-03"),
        admissionNo: `UC-${Date.now()}-${n}`,
      },
    });
    await db.studentEnrollment.create({
      data: { tenantId: a.id, sessionId: session.id, classArmId: armId, studentId: student.id, status: "ACTIVE" },
    });
    const made = await db.result.create({
      data: {
        tenantId: a.id,
        studentId: student.id,
        subjectId: maths.id,
        periodId: period.id,
        score: 60,
        status: ResultStatus.SUBMITTED,
        verificationToken: `uc-${Date.now()}-${n}`,
      },
    });
    return made.id;
  };
  result = {
    jss1: await pupil("Joke", arms.jss1.id),
    jss2: await pupil("Jide", arms.jss2.id),
    sss1: await pupil("Sade", arms.sss1.id),
    pri1: await pupil("Pere", arms.pri1.id),
  };

  for (const [key, user] of Object.entries({ ...people, admin })) {
    const res = await loginAs(user, SAAS);
    expect(res.status).toBe(200);
    cookie[key] = cookieHeader(res.token!);
  }
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

test.beforeEach(async () => {
  await db.result.updateMany({ where: { id: { in: Object.values(result) } }, data: { status: ResultStatus.SUBMITTED } });
  await db.section.updateMany({ where: { id: { in: [junior.id, senior.id] } }, data: { archivedAt: null } });
  await setting(UnsectionedClassApproval.GENERAL_OR_CLASS_ONLY);
});

test.describe("the default: GENERAL_OR_CLASS_ONLY (a class group with no section is reached only by a General scope or a Class scope on it)", () => {
  test("a Section approver sees only the classes of their sections, not the class group of their campus that has no section", async () => {
    expect(await list("northSection")).toEqual([result.jss1]);
    expect(await list("southSection")).toEqual([result.sss1]);
    const res = await approve("northSection", [result.jss2]);
    expect(res.status, res.text).toBe(403);
    expect(await db.result.findUniqueOrThrow({ where: { id: result.jss2 } }).then((row) => row.status)).toBe(ResultStatus.SUBMITTED);
  });

  test("a General approver and an administrator still reach every class group", async () => {
    expect(await list("general")).toEqual(sorted(Object.values(result)));
    expect(await list("admin")).toEqual(sorted(Object.values(result)));
  });
});

test.describe("ANY_SECTION_APPROVER", () => {
  test.beforeEach(async () => {
    await setting(UnsectionedClassApproval.ANY_SECTION_APPROVER);
  });

  test("a Section approver also reaches the class groups with no section in the SAME campus, in the list and in an action, and not those of another campus", async () => {
    expect(await list("northSection")).toEqual(sorted([result.jss1, result.jss2]));
    expect(await list("southSection")).toEqual(sorted([result.sss1, result.pri1]));
    const ok = await approve("northSection", [result.jss2]);
    expect(ok.status, ok.text).toBe(200);
    expect(await db.result.findUniqueOrThrow({ where: { id: result.jss2 } }).then((row) => row.status)).toBe(ResultStatus.APPROVED);
    const other = await approve("northSection", [result.pri1]); // the South campus's class group with no section
    expect(other.status, other.text).toBe(403);
  });

  test("it gives nothing to a Class-only approver, a person with no scope, or a person whose only section is archived", async () => {
    expect(await list("classOnly")).toEqual([result.jss1]);
    expect(await list("noScope")).toEqual([]);
    expect(await list("archivedOnly")).toEqual([]);
    const res = await approve("noScope", [result.jss2]);
    expect(res.status, res.text).toBe(403);
  });

  test("archiving the person's section ends it all, including what the setting added", async () => {
    await db.section.update({ where: { id: junior.id }, data: { archivedAt: new Date() } });
    expect(await list("northSection")).toEqual([]);
    const res = await approve("northSection", [result.jss2]);
    expect(res.status, res.text).toBe(403);
  });

  test("a General approver and an administrator are unchanged", async () => {
    expect(await list("general")).toEqual(sorted(Object.values(result)));
    expect(await list("admin")).toEqual(sorted(Object.values(result)));
  });
});

test.describe("changing the setting: school administrator only, fresh re-authentication, audited, flagged as widening", () => {
  const patch = (who: string, changes: Record<string, unknown>, password: string) =>
    api(`${base()}/settings`, { ...as(who), method: "PATCH", body: { changes, stepUp: { type: "password", value: password } } });

  test("the administrator turns it on and off; each change is one audit row with the old and new value, and turning it on is flagged as widening", async () => {
    const before = await db.settingsChangeAudit.count({ where: { tenantId: a.id, field: "unsectionedClassApproval" } });
    const on = await patch("admin", { unsectionedClassApproval: "ANY_SECTION_APPROVER" }, admin.password);
    expect(on.status, on.text).toBe(200);
    expect(on.json.data.settings.unsectionedClassApproval).toBe("ANY_SECTION_APPROVER");
    expect(on.json.data.deltas).toEqual([
      { field: "unsectionedClassApproval", fromValue: "GENERAL_OR_CLASS_ONLY", toValue: "ANY_SECTION_APPROVER", isWeakeningSecurity: true },
    ]);
    expect(await list("northSection")).toEqual(sorted([result.jss1, result.jss2])); // the list follows at once

    const off = await patch("admin", { unsectionedClassApproval: "GENERAL_OR_CLASS_ONLY" }, admin.password);
    expect(off.status, off.text).toBe(200);
    expect(off.json.data.deltas[0]).toMatchObject({
      fromValue: "ANY_SECTION_APPROVER",
      toValue: "GENERAL_OR_CLASS_ONLY",
      isWeakeningSecurity: false,
    });
    expect(await list("northSection")).toEqual([result.jss1]);

    const rows = await db.settingsChangeAudit.findMany({
      where: { tenantId: a.id, field: "unsectionedClassApproval" },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(before + 2);
    expect(rows.slice(-2).map((row) => [row.fromValue, row.toValue, row.actorUserId])).toEqual([
      ["GENERAL_OR_CLASS_ONLY", "ANY_SECTION_APPROVER", admin.id],
      ["ANY_SECTION_APPROVER", "GENERAL_OR_CLASS_ONLY", admin.id],
    ]);
  });

  test("a wrong password changes nothing; a teacher (even an approver) and a value that is not one of the two are refused", async () => {
    const wrong = await patch("admin", { unsectionedClassApproval: "ANY_SECTION_APPROVER" }, "not-the-password");
    expect(wrong.status, wrong.text).toBe(403);
    const teacher = await patch("northSection", { unsectionedClassApproval: "ANY_SECTION_APPROVER" }, people.northSection.password);
    expect(teacher.status, teacher.text).toBe(403);
    const invalid = await patch("admin", { unsectionedClassApproval: "EVERYONE" }, admin.password);
    expect(invalid.status, invalid.text).toBe(400);
    expect((await db.schoolSettings.findUniqueOrThrow({ where: { tenantId: a.id } })).unsectionedClassApproval).toBe(
      "GENERAL_OR_CLASS_ONLY",
    );
  });

  test("setting the value it already has writes no audit row", async () => {
    const before = await db.settingsChangeAudit.count({ where: { tenantId: a.id, field: "unsectionedClassApproval" } });
    const same = await patch("admin", { unsectionedClassApproval: "GENERAL_OR_CLASS_ONLY" }, admin.password);
    expect(same.status, same.text).toBe(200);
    expect(same.json.data.deltas).toEqual([]);
    expect(await db.settingsChangeAudit.count({ where: { tenantId: a.id, field: "unsectionedClassApproval" } })).toBe(before);
  });
});

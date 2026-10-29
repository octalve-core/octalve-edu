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
  deactivateMembership,
  grantApprovalScope,
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// ADR 0018, slice 2b: the school administrator sets up sections and says where each approver approves. Five routes under /settings: sections (list, create, change),
// the section of a class group, and the approvers with their scopes. ADMIN only, the same fresh re-authentication as the school's other settings, one audit row per change,
// and what is set here is what the results list and the approval transitions then follow.
//
// School A has two campuses, North and South. Class groups: JSS 1 and JSS 2 (North), SSS 1 (South), and Staff Room Class (no campus). School B has a section and a class group of its own.

const SAAS = { baseUrl: SAAS_URL };

let a: TestTenant;
let b: TestTenant;
let north: { id: string };
let south: { id: string };
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
let groups: Record<"jss1" | "jss2" | "sss1" | "wide", { id: string }>;
let foreignGroup: { id: string };
let foreignSection: { id: string };
let foreignCampus: { id: string };
let result: Record<"jss1" | "jss2" | "sss1", string>;

const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const base = () => `/api/v1/schools/${a.code}/settings`;
const proof = (who = "admin") => ({ type: "password", value: people[who].password });
const post = (path: string, body: Record<string, unknown>, who = "admin") =>
  api(`${base()}${path}`, { ...as(who), method: "POST", body: { ...body, stepUp: proof(who) } });
const patch = (path: string, body: Record<string, unknown>, who = "admin") =>
  api(`${base()}${path}`, { ...as(who), method: "PATCH", body: { ...body, stepUp: proof(who) } });
const put = (path: string, body: Record<string, unknown>, who = "admin") =>
  api(`${base()}${path}`, { ...as(who), method: "PUT", body: { ...body, stepUp: proof(who) } });
const get = (path: string, who = "admin") => api(`${base()}${path}`, as(who));
/// The audit rows this test wrote: the trail is append-only, so the ones from earlier tests are set aside in `beforeEach` and left out here.
let seenAuditIds = new Set<string>();
const audits = async (action: string) =>
  (await db.auditLog.findMany({ where: { tenantId: a.id, action }, orderBy: { createdAt: "asc" } })).filter(
    (row) => !seenAuditIds.has(row.id),
  );
const newSection = async (name: string, campusId: string | null = north.id) => {
  const res = await post("/sections", { name, campusId });
  expect(res.status, res.text).toBe(200);
  return res.json.data.section as { id: string; name: string };
};
const scopesOf = async (userKey: string) =>
  (await db.resultApprovalScope.findMany({ where: { tenantId: a.id, userId: people[userKey].id } })).map(
    (row) => row.kind + ":" + (row.sectionId ?? row.classGroupId ?? ""),
  );

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Approver Settings", campuses: ["North", "South"] });
  b = await createTenant({ name: "Beta Approver Settings" });
  [north, south] = a.campuses;
  foreignCampus = b.campuses[0];

  for (const key of ["admin", "adminB", "campusAdmin", "teacherApprover", "northApprover", "wideApprover", "plainTeacher", "gone"])
    people[key] = await createUser();
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  await addMembership(people.campusAdmin.id, a.id, Role.CAMPUS_ADMIN, north.id);
  await addMembership(people.plainTeacher.id, a.id, Role.TEACHING_STAFF);
  const approver = (key: string, campusId: string | null) =>
    db.tenantMembership.create({
      data: { userId: people[key].id, tenantId: a.id, role: Role.TEACHING_STAFF, campusId, permissions: [Permission.CAN_APPROVE_RESULTS] },
    });
  await approver("teacherApprover", null);
  await approver("northApprover", north.id);
  await approver("wideApprover", null);
  await approver("gone", null);
  for (const key of ["teacherApprover", "northApprover", "wideApprover", "gone"]) await grantApprovalScope(people[key].id, a.id);
  await deactivateMembership(people.gone.id, a.id);

  const group = (name: string, sortOrder: number, campusId: string | null) =>
    db.classGroup.create({ data: { tenantId: a.id, name, sortOrder, campusId } });
  groups = {
    jss1: await group("JSS 1", 1, north.id),
    jss2: await group("JSS 2", 2, north.id),
    sss1: await group("SSS 1", 3, south.id),
    wide: await group("Staff Room Class", 4, null),
  };
  foreignSection = await db.section.create({ data: { tenantId: b.id, name: "Foreign section", campusId: foreignCampus.id } });
  foreignGroup = await db.classGroup.create({ data: { tenantId: b.id, name: "Foreign class", sortOrder: 1, campusId: foreignCampus.id } });

  // one pupil with a SUBMITTED result in each of three class groups, to see the scope act on the results list
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
  const maths = await db.subject.create({ data: { tenantId: a.id, name: "Mathematics", code: "MAS2" } });
  let n = 0;
  const pupil = async (label: string, groupKey: "jss1" | "jss2" | "sss1") => {
    n += 1;
    const arm = await db.classArm.create({ data: { tenantId: a.id, classGroupId: groups[groupKey].id, name: "A" } });
    const student = await db.studentRecord.create({
      data: {
        tenantId: a.id,
        firstName: label,
        lastName: "Settings",
        dateOfBirth: new Date("2013-03-03"),
        admissionNo: `AP-${Date.now()}-${n}`,
      },
    });
    await db.studentEnrollment.create({
      data: { tenantId: a.id, sessionId: session.id, classArmId: arm.id, studentId: student.id, status: "ACTIVE" },
    });
    const made = await db.result.create({
      data: {
        tenantId: a.id,
        studentId: student.id,
        subjectId: maths.id,
        periodId: period.id,
        score: 60,
        status: ResultStatus.SUBMITTED,
        verificationToken: `ap-${Date.now()}-${n}`,
      },
    });
    return made.id;
  };
  result = { jss1: await pupil("Joke", "jss1"), jss2: await pupil("Jide", "jss2"), sss1: await pupil("Sade", "sss1") };

  for (const [key, user] of Object.entries(people)) {
    const res = await loginAs(user, SAAS);
    expect(res.status).toBe(200);
    cookie[key] = cookieHeader(res.token!);
  }
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

test.beforeEach(async () => {
  seenAuditIds = new Set((await db.auditLog.findMany({ where: { tenantId: a.id }, select: { id: true } })).map((row) => row.id));
  // every test starts from the same place: no sections of this school, no class group placed, the approvers with their General scope
  await db.resultApprovalScope.deleteMany({ where: { tenantId: a.id } });
  await db.classGroup.updateMany({ where: { tenantId: a.id }, data: { sectionId: null } });
  await db.section.deleteMany({ where: { tenantId: a.id } });
  for (const key of ["teacherApprover", "northApprover", "wideApprover", "gone"]) await grantApprovalScope(people[key].id, a.id);
});

test.describe("who may use these routes: the school's administrator, with a fresh proof", () => {
  test("a teacher (even one who approves results), a campus administrator and nobody signed in are refused on every route; another school's administrator sees only their own school", async () => {
    const section = await newSection("Junior");
    const calls: Array<[string, string, Record<string, unknown> | undefined]> = [
      ["GET", "/sections", undefined],
      ["POST", "/sections", { name: "Senior", campusId: north.id }],
      ["PATCH", `/sections/${section.id}`, { name: "Renamed" }],
      ["PUT", `/class-groups/${groups.jss1.id}/section`, { sectionId: section.id }],
      ["GET", "/approvers", undefined],
      ["PUT", `/approvers/${people.northApprover.id}/scopes`, { scopes: [] }],
    ];
    for (const who of ["teacherApprover", "plainTeacher", "campusAdmin"]) {
      for (const [method, path, body] of calls) {
        const res = await api(`${base()}${path}`, { ...as(who), method, ...(body ? { body: { ...body, stepUp: proof(who) } } : {}) });
        expect(res.status, `${who} ${method} ${path}: ${res.text}`).toBe(403);
      }
    }
    for (const [method, path, body] of calls) {
      const res = await api(`${base()}${path}`, { ...SAAS, method, ...(body ? { body: { ...body, stepUp: proof() } } : {}) });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
    expect((await db.section.findUniqueOrThrow({ where: { id: section.id } })).name).toBe("Junior"); // nothing changed
    // the other school's administrator is an administrator of THEIR school only: school A's address is not theirs
    const foreign = await api(`${base()}/sections`, as("adminB"));
    expect(foreign.status, foreign.text).toBe(403);
  });

  test("a missing, wrong or malformed proof changes nothing: the body is checked, then the password", async () => {
    const missing = await api(`${base()}/sections`, { ...as("admin"), method: "POST", body: { name: "Junior", campusId: north.id } });
    expect(missing.status, missing.text).toBe(400);
    const wrong = await api(`${base()}/sections`, {
      ...as("admin"),
      method: "POST",
      body: { name: "Junior", campusId: north.id, stepUp: { type: "password", value: "not-the-password" } },
    });
    expect(wrong.status, wrong.text).toBe(403);
    const extra = await post("/sections", { name: "Junior", campusId: north.id, surprise: true });
    expect(extra.status, extra.text).toBe(400);
    expect(await db.section.count({ where: { tenantId: a.id } })).toBe(0);
    expect(await audits("SECTION_CREATED")).toHaveLength(0);
  });
});

test.describe("sections", () => {
  test("the list shows the sections with their class groups, the class groups in none, and the campuses; archived sections come last", async () => {
    const junior = await newSection("Junior");
    const old = await newSection("Old");
    expect((await put(`/class-groups/${groups.jss1.id}/section`, { sectionId: junior.id })).status).toBe(200);
    expect((await patch(`/sections/${old.id}`, { archived: true })).status).toBe(200);
    const res = await get("/sections");
    expect(res.status, res.text).toBe(200);
    const data = res.json.data;
    expect(data.sections.map((s: { name: string; archived: boolean }) => [s.name, s.archived])).toEqual([
      ["Junior", false],
      ["Old", true],
    ]);
    expect(data.sections[0].classGroups.map((g: { name: string }) => g.name)).toEqual(["JSS 1"]);
    expect(data.sections[0].campusName).toBe("North");
    expect(data.unplacedClassGroups.map((g: { name: string }) => g.name)).toEqual(["JSS 2", "SSS 1", "Staff Room Class"]);
    expect(data.campuses.map((c: { name: string }) => c.name)).toEqual(["North", "South"]);
    expect(JSON.stringify(data)).not.toContain("Foreign"); // nothing of the other school
  });

  test("create: one audit row; a blank, over-long or non-text name, a campus that is not this school's, and a repeated name on the same campus (any case) are refused; the same name on another campus is fine", async () => {
    const junior = await newSection("  Junior   Secondary ");
    expect(junior.name).toBe("Junior Secondary");
    const rows = await audits("SECTION_CREATED");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ targetType: "Section", targetId: junior.id, actorUserId: people.admin.id });
    expect(rows[0].afterValue).toMatchObject({ name: "Junior Secondary", campusId: north.id });

    for (const name of ["", "   ", "x".repeat(81), 7]) {
      const res = await post("/sections", { name, campusId: north.id });
      expect(res.status, JSON.stringify(name)).toBe(400);
    }
    expect((await post("/sections", { name: "Elsewhere", campusId: foreignCampus.id })).status).toBe(400);
    expect((await post("/sections", { name: "Nowhere", campusId: "no-such-campus" })).status).toBe(400);
    const dup = await post("/sections", { name: "JUNIOR secondary", campusId: north.id });
    expect(dup.status, dup.text).toBe(409);
    expect(dup.json.error.code).toBe("NAME_TAKEN");
    expect((await post("/sections", { name: "Junior Secondary", campusId: south.id })).status).toBe(200);
    expect((await post("/sections", { name: "School wide" })).status).toBe(200); // no campus at all
    expect(await db.section.count({ where: { tenantId: a.id } })).toBe(3);
  });

  test("change: rename, reorder, archive and restore each write their own audit row; an archived section can only be restored; a taken name is 409; changing nothing writes nothing", async () => {
    const junior = await newSection("Junior");
    const other = await newSection("Senior");

    expect((await patch(`/sections/${junior.id}`, { name: "Junior School" })).json.data.section.name).toBe("Junior School");
    expect((await audits("SECTION_RENAMED"))[0]).toMatchObject({ targetId: junior.id });
    expect((await audits("SECTION_RENAMED"))[0].beforeValue).toMatchObject({ name: "Junior" });
    expect((await patch(`/sections/${junior.id}`, { sortOrder: 5 })).json.data.section.sortOrder).toBe(5);
    expect(await audits("SECTION_REORDERED")).toHaveLength(1);

    const clash = await patch(`/sections/${junior.id}`, { name: "senior" });
    expect(clash.status, clash.text).toBe(409);

    const same = await patch(`/sections/${junior.id}`, { name: "Junior School", sortOrder: 5 });
    expect(same.status, same.text).toBe(200);
    expect(same.json.data.changed).toBe(false);
    expect(await audits("SECTION_RENAMED")).toHaveLength(1);

    expect((await patch(`/sections/${junior.id}`, { archived: true })).json.data.section.archived).toBe(true);
    expect(await audits("SECTION_ARCHIVED")).toHaveLength(1);
    const frozen = await patch(`/sections/${junior.id}`, { name: "Changed while archived" });
    expect(frozen.status, frozen.text).toBe(409);
    expect(frozen.json.error.code).toBe("ARCHIVED");

    // the name of the archived section can be used again, and then it cannot come back under that name
    await newSection("Junior School");
    const taken = await patch(`/sections/${junior.id}`, { archived: false });
    expect(taken.status, taken.text).toBe(409);
    expect(taken.json.error.code).toBe("NAME_TAKEN");
    await patch(`/sections/${other.id}`, { archived: true });
    expect((await patch(`/sections/${other.id}`, { archived: false })).json.data.section.archived).toBe(false);
    expect(await audits("SECTION_RESTORED")).toHaveLength(1);
  });

  test("an unknown id, another school's section and an id that cannot be ours are all 'no such section'; an empty change is 400", async () => {
    for (const id of ["nosuchsection", foreignSection.id, "a/b", "x".repeat(70)]) {
      const res = await patch(`/sections/${encodeURIComponent(id)}`, { name: "Whatever" });
      expect(res.status, `${id}: ${res.text}`).toBe(404);
    }
    const junior = await newSection("Junior");
    expect((await patch(`/sections/${junior.id}`, {})).status).toBe(400);
    expect((await db.section.findUniqueOrThrow({ where: { id: foreignSection.id } })).name).toBe("Foreign section");
  });
});

test.describe("the section of a class group", () => {
  test("place, move and take out: a class group is in at most one section, and each change is audited; putting it where it already is writes nothing", async () => {
    const junior = await newSection("Junior");
    const senior = await newSection("Senior");
    const place = (sectionId: string | null) => put(`/class-groups/${groups.jss1.id}/section`, { sectionId });

    const first = await place(junior.id);
    expect(first.status, first.text).toBe(200);
    expect(first.json.data).toMatchObject({ changed: true, classGroup: { id: groups.jss1.id, sectionId: junior.id } });
    expect((await place(senior.id)).json.data.classGroup.sectionId).toBe(senior.id); // moved, not added
    const sectionsNow = (await get("/sections")).json.data.sections as Array<{ name: string; classGroups: Array<{ id: string }> }>;
    expect(sectionsNow.find((s) => s.name === "Junior")!.classGroups).toEqual([]);
    expect(sectionsNow.find((s) => s.name === "Senior")!.classGroups.map((g) => g.id)).toEqual([groups.jss1.id]);

    expect((await place(senior.id)).json.data.changed).toBe(false);
    expect((await place(null)).json.data.classGroup.sectionId).toBeNull();
    const rows = await audits("CLASS_GROUP_SECTION_CHANGED");
    expect(rows.map((r) => [r.beforeValue, r.afterValue])).toEqual([
      [{ sectionId: null }, { sectionId: junior.id }],
      [{ sectionId: junior.id }, { sectionId: senior.id }],
      [{ sectionId: senior.id }, { sectionId: null }],
    ]);
  });

  test("an archived section, a section of another campus, and a class group or section of another school are refused", async () => {
    const junior = await newSection("Junior"); // North
    const southSection = await newSection("South section", south.id);
    const archived = await newSection("Archived");
    await patch(`/sections/${archived.id}`, { archived: true });

    const toArchived = await put(`/class-groups/${groups.jss1.id}/section`, { sectionId: archived.id });
    expect(toArchived.status, toArchived.text).toBe(409);
    const wrongCampus = await put(`/class-groups/${groups.sss1.id}/section`, { sectionId: junior.id }); // SSS 1 is in South
    expect(wrongCampus.status, wrongCampus.text).toBe(409);
    expect(wrongCampus.json.error.code).toBe("CAMPUS_MISMATCH");
    const noCampusGroup = await put(`/class-groups/${groups.wide.id}/section`, { sectionId: southSection.id });
    expect(noCampusGroup.status, noCampusGroup.text).toBe(409); // a class group with no campus belongs in a section with no campus only
    expect((await put(`/class-groups/${groups.jss1.id}/section`, { sectionId: foreignSection.id })).status).toBe(404);
    expect((await put(`/class-groups/${foreignGroup.id}/section`, { sectionId: junior.id })).status).toBe(404);
    expect((await put(`/class-groups/nosuchgroup/section`, { sectionId: junior.id })).status).toBe(404);
    expect((await put(`/class-groups/${groups.jss1.id}/section`, { sectionId: 5 })).status).toBe(400);
    expect(await db.classGroup.count({ where: { tenantId: a.id, sectionId: { not: null } } })).toBe(0);
    expect(await audits("CLASS_GROUP_SECTION_CHANGED")).toHaveLength(0);
    expect((await db.classGroup.findUniqueOrThrow({ where: { id: foreignGroup.id } })).sectionId).toBeNull();
  });
});

test.describe("approvers and where they approve", () => {
  test("the list has the active holders of the permission with their scopes: not a plain teacher, not a deactivated person, not another school's", async () => {
    const junior = await newSection("Junior");
    await db.resultApprovalScope.deleteMany({ where: { tenantId: a.id, userId: people.northApprover.id } });
    await grantApprovalScope(people.northApprover.id, a.id, { kind: "SECTION", sectionId: junior.id });
    await grantApprovalScope(people.northApprover.id, a.id, { kind: "CLASS", classGroupId: groups.jss2.id });

    const res = await get("/approvers");
    expect(res.status, res.text).toBe(200);
    const approvers = res.json.data.approvers as Array<{
      userId: string;
      scopes: Array<{ kind: string; sectionName: string | null; classGroupName: string | null }>;
    }>;
    expect(approvers.map((p) => p.userId).sort()).toEqual(
      [people.teacherApprover.id, people.northApprover.id, people.wideApprover.id].sort(),
    );
    const mine = approvers.find((p) => p.userId === people.northApprover.id)!;
    expect(mine.scopes.map((s) => [s.kind, s.sectionName, s.classGroupName])).toEqual([
      ["SECTION", "Junior", null],
      ["CLASS", null, "JSS 2"],
    ]);
    expect(approvers.find((p) => p.userId === people.teacherApprover.id)!.scopes.map((s) => s.kind)).toEqual(["GENERAL"]);
  });

  test("set: the set is replaced as a whole, a repeated entry counts once, and the audit row has the set before and after", async () => {
    const junior = await newSection("Junior");
    const res = await put(`/approvers/${people.wideApprover.id}/scopes`, {
      scopes: [
        { kind: "CLASS", classGroupId: groups.sss1.id },
        { kind: "SECTION", sectionId: junior.id },
        { kind: "SECTION", sectionId: junior.id },
      ],
    });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.changed).toBe(true);
    expect((await scopesOf("wideApprover")).sort()).toEqual([`CLASS:${groups.sss1.id}`, `SECTION:${junior.id}`].sort());
    const rows = await audits("RESULT_APPROVAL_SCOPE_CHANGED");
    const last = rows[rows.length - 1];
    expect(last).toMatchObject({ targetType: "User", targetId: people.wideApprover.id, actorUserId: people.admin.id });
    expect(last.beforeValue).toEqual({ scopes: [{ kind: "GENERAL" }] });
    expect(last.afterValue).toEqual({
      scopes: [
        { kind: "SECTION", sectionId: junior.id },
        { kind: "CLASS", classGroupId: groups.sss1.id },
      ],
    });
    const again = await put(`/approvers/${people.wideApprover.id}/scopes`, {
      scopes: [
        { kind: "SECTION", sectionId: junior.id },
        { kind: "CLASS", classGroupId: groups.sss1.id },
      ],
    });
    expect(again.json.data.changed).toBe(false);
    expect(await audits("RESULT_APPROVAL_SCOPE_CHANGED")).toHaveLength(rows.length); // the same set in another order: nothing written
  });

  test("what is set here is what the results list shows and the approval allows: General, then one section, then one class, then nothing", async () => {
    const junior = await newSection("Junior");
    await put(`/class-groups/${groups.jss1.id}/section`, { sectionId: junior.id });
    await put(`/class-groups/${groups.jss2.id}/section`, { sectionId: junior.id });
    const listOf = async () => {
      const res = await api(`/api/v1/schools/${a.code}/academics/results`, as("wideApprover"));
      expect(res.status, res.text).toBe(200);
      return (res.json.data.results as Array<{ id: string }>).map((row) => row.id).sort();
    };
    const approve = (id: string) =>
      api(`/api/v1/schools/${a.code}/academics/results/transition`, {
        ...as("wideApprover"),
        method: "POST",
        body: { resultIds: [id], toStatus: ResultStatus.APPROVED },
      });

    expect(await listOf()).toEqual([result.jss1, result.jss2, result.sss1].sort()); // General, as at the start
    await put(`/approvers/${people.wideApprover.id}/scopes`, { scopes: [{ kind: "SECTION", sectionId: junior.id }] });
    expect(await listOf()).toEqual([result.jss1, result.jss2].sort());
    expect((await approve(result.sss1)).status).toBe(403);
    await put(`/approvers/${people.wideApprover.id}/scopes`, { scopes: [{ kind: "CLASS", classGroupId: groups.sss1.id }] });
    expect(await listOf()).toEqual([result.sss1]);
    const ok = await approve(result.sss1);
    expect(ok.status, ok.text).toBe(200);
    await put(`/approvers/${people.wideApprover.id}/scopes`, { scopes: [] });
    expect(await listOf()).toEqual([]);
    expect((await approve(result.jss1)).status).toBe(403);
  });

  test("refused: General with anything else, a person who does not hold the permission, a person who is deactivated or in another school, a section or class group of another school, an archived section, and one in another campus than the person's", async () => {
    const junior = await newSection("Junior"); // North
    const southSection = await newSection("South section", south.id);
    const archived = await newSection("Archived");
    await patch(`/sections/${archived.id}`, { archived: true });
    const set = (who: string, scopes: unknown[]) => put(`/approvers/${people[who].id}/scopes`, { scopes });

    const mixed = await set("wideApprover", [{ kind: "GENERAL" }, { kind: "SECTION", sectionId: junior.id }]);
    expect(mixed.status, mixed.text).toBe(400);
    const plain = await set("plainTeacher", [{ kind: "GENERAL" }]);
    expect(plain.status, plain.text).toBe(409);
    expect(plain.json.error.code).toBe("NOT_AN_APPROVER");
    expect((await set("gone", [{ kind: "GENERAL" }])).status).toBe(404);
    expect((await put(`/approvers/${people.adminB.id}/scopes`, { scopes: [] })).status).toBe(404);
    expect((await put(`/approvers/no-such-person/scopes`, { scopes: [] })).status).toBe(404);
    expect((await set("wideApprover", [{ kind: "SECTION", sectionId: foreignSection.id }])).status).toBe(404);
    expect((await set("wideApprover", [{ kind: "CLASS", classGroupId: foreignGroup.id }])).status).toBe(404);
    const toArchived = await set("wideApprover", [{ kind: "SECTION", sectionId: archived.id }]);
    expect(toArchived.status, toArchived.text).toBe(409);
    // a person tied to North cannot be given South's section or class group, and can be given North's
    const crossCampus = await set("northApprover", [{ kind: "SECTION", sectionId: southSection.id }]);
    expect(crossCampus.status, crossCampus.text).toBe(409);
    expect(crossCampus.json.error.code).toBe("CAMPUS_MISMATCH");
    expect((await set("northApprover", [{ kind: "CLASS", classGroupId: groups.sss1.id }])).status).toBe(409);
    expect(
      (
        await set("northApprover", [
          { kind: "SECTION", sectionId: junior.id },
          { kind: "CLASS", classGroupId: groups.jss2.id },
        ])
      ).status,
    ).toBe(200);
    // a person with no campus can be given any campus's, and a class group with no campus is open to everyone
    expect((await set("wideApprover", [{ kind: "SECTION", sectionId: southSection.id }])).status).toBe(200);
    expect((await set("northApprover", [{ kind: "CLASS", classGroupId: groups.wide.id }])).status).toBe(200);
    // the refusals changed nothing for the people they named
    expect(await scopesOf("plainTeacher")).toEqual([]);
    expect(await scopesOf("gone")).toEqual([`GENERAL:`]);
    expect(await db.resultApprovalScope.count({ where: { tenantId: b.id } })).toBe(0);
  });

  test("a wrong proof changes nothing", async () => {
    const res = await api(`${base()}/approvers/${people.wideApprover.id}/scopes`, {
      ...as("admin"),
      method: "PUT",
      body: { scopes: [], stepUp: { type: "password", value: "not-the-password" } },
    });
    expect(res.status, res.text).toBe(403);
    expect(await scopesOf("wideApprover")).toEqual([`GENERAL:`]);
  });
});

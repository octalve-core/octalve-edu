import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import {
  Role,
  addMembership,
  createTenant,
  createUser,
  db,
  deactivateMembership,
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// A pupil's and a guardian's sign-in account, linked to their record (task 0065), over real HTTP against the SaaS-mode server: who may read the choices and link, the status and code of every refusal,
// the campus rule, that two requests at once make one link, the audit rows, and the point of it all: before the link the portal does not know the pupil or the guardian's child, after it it does.
// Every route is ALSO covered by tenant-boundary.spec.ts and the route guards (file-system discovery).

const SAAS = { baseUrl: SAAS_URL };
const NO_ACCESS = { data: null, meta: {}, error: { code: "FORBIDDEN", message: "You don't have access to this school." } };

let a: TestTenant;
let b: TestTenant;
let admin: TestUser;
let northAdmin: TestUser; // CAMPUS_ADMIN at North
let teacher: TestUser;
let clerk: TestUser;
let parent: TestUser; // PARENT, no campus
let learner: TestUser; // STUDENT at North
let southLearner: TestUser; // STUDENT at South
let former: TestUser; // STUDENT, deactivated
let outsider: TestUser; // ADMIN of the other school
let foreignLearner: TestUser; // STUDENT of the other school
const cookie: Record<string, string> = {};

const people = (code = a.code) => `/api/v1/schools/${code}/people`;
const as = (who: string, extra: object = {}) => ({ ...SAAS, cookie: cookie[who], ...extra });
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
const ids = (res: { json: { data: { accounts: { userId: string }[] } } }) => res.json.data.accounts.map((x) => x.userId);

async function cookieFor(user: TestUser) {
  const res = await loginAs(user, SAAS);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}
const pupil = (campusId: string | null = null, school: TestTenant = a) =>
  db.studentRecord.create({
    data: {
      tenantId: school.id,
      campusId,
      firstName: uniq("Ada"),
      lastName: "Pupil",
      dateOfBirth: new Date("2014-03-02"),
      admissionNo: uniq("ADM/"),
    },
  });
/// A guardian record, linked (approved, as an administrator's link is) to each of the pupils given.
async function guardianOf(...students: { id: string }[]) {
  const guardian = await db.guardianRecord.create({ data: { tenantId: a.id, firstName: uniq("Grace"), lastName: "Guardian" } });
  for (const student of students)
    await db.guardianLink.create({ data: { tenantId: a.id, studentId: student.id, guardianId: guardian.id, relationship: "MOTHER" } });
  return guardian;
}
const studentUrl = (id: string, action: string) => `${people()}/students/${id}/${action}`;
const guardianUrl = (id: string, action: string) => `${people()}/guardians/${id}/${action}`;
const link = (url: string, userId: string, who = "admin") => api(url, as(who, { method: "POST", body: { userId } }));

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha School", campuses: ["Alpha North", "Alpha South"] });
  b = await createTenant({ name: "Beta School", campuses: ["Beta Main"] });
  [admin, northAdmin, teacher, clerk, parent, learner, southLearner, former, outsider, foreignLearner] = await Promise.all(
    [
      "Ada Admin",
      "Nora North",
      "Tola Teacher",
      "Clem Clerk",
      "Pat Parent",
      "Sam Student",
      "Sola South",
      "Fay Former",
      "Bayo Elsewhere",
      "Femi Foreign",
    ].map((name) => createUser({ name })),
  );
  const [north, south] = a.campuses;
  await addMembership(admin.id, a.id, Role.ADMIN);
  await addMembership(northAdmin.id, a.id, Role.CAMPUS_ADMIN, north.id);
  await addMembership(teacher.id, a.id, Role.TEACHING_STAFF, north.id);
  await addMembership(clerk.id, a.id, Role.NON_TEACHING_STAFF);
  await addMembership(parent.id, a.id, Role.PARENT);
  await addMembership(learner.id, a.id, Role.STUDENT, north.id);
  await addMembership(southLearner.id, a.id, Role.STUDENT, south.id);
  await addMembership(former.id, a.id, Role.STUDENT, north.id);
  await addMembership(outsider.id, b.id, Role.ADMIN);
  await addMembership(foreignLearner.id, b.id, Role.STUDENT);
  await deactivateMembership(former.id, a.id);
  for (const [who, user] of Object.entries({ admin, northAdmin, teacher, clerk, parent, learner, southLearner, former, outsider }))
    cookie[who] = await cookieFor(user);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});
test.afterEach(async () => {
  // Every test starts with nobody linked: a link left behind would take an account out of the next test's choices.
  await db.studentRecord.updateMany({ where: { tenantId: a.id }, data: { userId: null } });
  await db.guardianRecord.updateMany({ where: { tenantId: a.id }, data: { userId: null } });
});

test.describe("who may", () => {
  test("the choices and both writes are an administrator's: staff, a parent, a pupil, a deactivated member and another school's administrator get the ONE 403 body, and nothing changes", async () => {
    const s = await pupil();
    const g = await guardianOf(s);
    const calls: [string, string, object | undefined][] = [
      ["GET", studentUrl(s.id, "linkable-accounts"), undefined],
      ["POST", studentUrl(s.id, "link-account"), { userId: learner.id }],
      ["POST", studentUrl(s.id, "unlink-account"), undefined],
      ["GET", guardianUrl(g.id, "linkable-accounts"), undefined],
      ["POST", guardianUrl(g.id, "link-account"), { userId: parent.id }],
      ["POST", guardianUrl(g.id, "unlink-account"), undefined],
    ];
    for (const [method, url, body] of calls) {
      for (const who of ["teacher", "clerk", "parent", "learner", "former", "outsider"]) {
        const res = await api(url, as(who, { method, ...(body ? { body } : {}) }));
        expect(res.status, `${who} ${method} ${url}`).toBe(403);
        expect(res.json, `${who} ${method} ${url}`).toEqual(NO_ACCESS);
      }
      // signed out: the same answer as for any school route, and never a hint that the record exists
      expect((await api(url, { ...SAAS, method, ...(body ? { body } : {}) })).status, `signed out ${method} ${url}`).toBe(401);
    }
    expect((await db.studentRecord.findUniqueOrThrow({ where: { id: s.id } })).userId).toBeNull();
    expect((await db.guardianRecord.findUniqueOrThrow({ where: { id: g.id } })).userId).toBeNull();
    expect(
      await db.auditLog.count({ where: { tenantId: a.id, action: { contains: "ACCOUNT_LINKED" }, targetId: { in: [s.id, g.id] } } }),
    ).toBe(0);
  });

  test("an unknown record, another school's record and a malformed id are the same 404, for the choices and for both writes", async () => {
    const foreign = await pupil(null, b);
    for (const id of ["cmissingmissingmissingmiss", foreign.id, "not an id"]) {
      for (const [method, action, body] of [
        ["GET", "linkable-accounts", undefined],
        ["POST", "link-account", { userId: learner.id }],
        ["POST", "unlink-account", undefined],
      ] as const) {
        const res = await api(studentUrl(encodeURIComponent(id), action), as("admin", { method, ...(body ? { body } : {}) }));
        expect(res.status, `${method} ${action} ${id}`).toBe(404);
        expect(res.json.error.code).toBe("NOT_FOUND");
        const guardian = await api(guardianUrl(encodeURIComponent(id), action), as("admin", { method, ...(body ? { body } : {}) }));
        expect(guardian.status, `guardian ${method} ${action} ${id}`).toBe(404);
        expect(guardian.json.error.code).toBe("NOT_FOUND");
      }
    }
  });
});

test.describe("a pupil's account", () => {
  test("the choices are the active members who sign in as a student and are not linked yet; link shows the account on the record; every wrong choice is refused with its code; unlink clears it", async () => {
    const s = await pupil();
    const other = await pupil();

    const choices = await api(studentUrl(s.id, "linkable-accounts"), as("admin"));
    expect(choices.status).toBe(200);
    expect(ids(choices)).toEqual(expect.arrayContaining([learner.id, southLearner.id]));
    for (const wrong of [parent.id, teacher.id, clerk.id, admin.id, former.id, foreignLearner.id])
      expect(ids(choices)).not.toContain(wrong);
    expect(choices.json.data.accounts.find((x: { userId: string }) => x.userId === learner.id)).toEqual({
      userId: learner.id,
      name: "Sam Student",
      email: learner.email,
    });

    // The wrong role, a deactivated member, another school's pupil, nobody at all: one refusal, in words that name a student.
    for (const userId of [parent.id, teacher.id, admin.id, former.id, foreignLearner.id, "nobody"]) {
      const res = await link(studentUrl(s.id, "link-account"), userId);
      expect(res.status, userId).toBe(409);
      expect(res.json.error.code, userId).toBe("ACCOUNT_MISMATCH");
      expect(res.json.error.message).toBe("Choose an active member of this school who signs in as a student.");
    }
    for (const body of [{}, { userId: "" }, { userId: learner.id, role: "ADMIN" }, { userId: 7 }]) {
      const res = await api(studentUrl(s.id, "link-account"), as("admin", { method: "POST", body }));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect((await db.studentRecord.findUniqueOrThrow({ where: { id: s.id } })).userId).toBeNull();

    const linked = await link(studentUrl(s.id, "link-account"), learner.id);
    expect(linked.status, JSON.stringify(linked.json)).toBe(200);
    const shown = {
      state: "linked",
      userId: learner.id,
      name: "Sam Student",
      email: learner.email,
      role: "STUDENT",
      deactivated: false,
      roleDiffers: false,
    };
    expect(linked.json.data.account).toEqual(shown);
    // The record says so wherever it is read: on its own page and in the list.
    expect((await api(`${people()}/students/${s.id}`, as("admin"))).json.data.student.account).toEqual(shown);
    const listed = await api(`${people()}/students?limit=100`, as("admin"));
    expect(listed.json.data.students.find((x: { id: string }) => x.id === s.id).account).toEqual(shown);
    expect(listed.json.data.students.find((x: { id: string }) => x.id === other.id).account).toEqual({ state: "none" });
    // ...and the account is no longer a choice for anyone.
    expect(ids(await api(studentUrl(other.id, "linkable-accounts"), as("admin")))).not.toContain(learner.id);

    const again = await link(studentUrl(s.id, "link-account"), southLearner.id);
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("ALREADY_LINKED_ACCOUNT");
    const taken = await link(studentUrl(other.id, "link-account"), learner.id);
    expect(taken.status).toBe(409);
    expect(taken.json.error.code).toBe("ACCOUNT_TAKEN");
    expect(taken.json.error.message).toBe("That account is already linked to another student.");

    const audit = await db.auditLog.findMany({ where: { tenantId: a.id, targetId: s.id, action: "STUDENT_ACCOUNT_LINKED" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorUserId: admin.id, targetType: "StudentRecord", afterValue: { userId: learner.id } });

    const unlinked = await api(studentUrl(s.id, "unlink-account"), as("admin", { method: "POST" }));
    expect(unlinked.status).toBe(200);
    expect(unlinked.json.data.account).toEqual({ state: "none" });
    expect((await db.studentRecord.findUniqueOrThrow({ where: { id: s.id } })).userId).toBeNull();
    const twice = await api(studentUrl(s.id, "unlink-account"), as("admin", { method: "POST" }));
    expect(twice.status).toBe(409);
    expect(twice.json.error.code).toBe("NOT_LINKED");
    expect(await db.auditLog.count({ where: { tenantId: a.id, targetId: s.id, action: "STUDENT_ACCOUNT_UNLINKED" } })).toBe(1);
    // The account and its membership are untouched: unlinking is not deactivating.
    expect(await db.tenantMembership.count({ where: { userId: learner.id, tenantId: a.id, deactivatedAt: null } })).toBe(1);
  });

  test("an archived pupil cannot be linked (restore first); an account switched off, or whose role was changed, is shown as such on the record", async () => {
    const archived = await pupil();
    await db.studentRecord.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
    const res = await link(studentUrl(archived.id, "link-account"), learner.id);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("ARCHIVED");

    const s = await pupil();
    const fleeting = await createUser({ name: "Rolo Changed" });
    await addMembership(fleeting.id, a.id, Role.STUDENT);
    expect((await link(studentUrl(s.id, "link-account"), fleeting.id)).status).toBe(200);
    await db.tenantMembership.update({ where: { userId_tenantId: { userId: fleeting.id, tenantId: a.id } }, data: { role: Role.PARENT } });
    expect((await api(`${people()}/students/${s.id}`, as("admin"))).json.data.student.account).toMatchObject({
      state: "linked",
      role: "PARENT",
      roleDiffers: true,
      deactivated: false,
    });
    await deactivateMembership(fleeting.id, a.id);
    expect((await api(`${people()}/students/${s.id}`, as("admin"))).json.data.student.account).toMatchObject({
      state: "linked",
      deactivated: true,
    });
  });

  test("THE POINT: before the link the pupil's portal does not know them; after it, it does; unlinked, it does not again", async () => {
    const s = await pupil(a.campuses[0].id);
    const probe = () => api(`/api/v1/schools/${a.code}/portal/practice/options`, as("learner"));
    const before = await probe();
    expect(before.status).toBe(404);
    expect(before.json.error.message).toBe("Student profile not found.");

    expect((await link(studentUrl(s.id, "link-account"), learner.id)).status).toBe(200);
    const after = await probe();
    expect(after.status, JSON.stringify(after.json)).toBe(200);

    expect((await api(studentUrl(s.id, "unlink-account"), as("admin", { method: "POST" }))).status).toBe(200);
    expect((await probe()).status).toBe(404);
  });

  test("two at once make one link: the same account offered to four pupils links one of them; four accounts offered to one pupil link one of them", async () => {
    const four = await Promise.all([pupil(), pupil(), pupil(), pupil()]);
    const answers = await Promise.all(four.map((s) => link(studentUrl(s.id, "link-account"), learner.id)));
    expect(answers.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
    for (const refused of answers.filter((r) => r.status === 409)) expect(refused.json.error.code).toBe("ACCOUNT_TAKEN");
    expect(await db.studentRecord.count({ where: { tenantId: a.id, userId: learner.id } })).toBe(1);

    const one = await pupil();
    const accounts = await Promise.all(["One", "Two", "Three", "Four"].map((name) => createUser({ name: `Racer ${name}` })));
    for (const account of accounts) await addMembership(account.id, a.id, Role.STUDENT);
    const race = await Promise.all(accounts.map((account) => link(studentUrl(one.id, "link-account"), account.id)));
    expect(race.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
    for (const refused of race.filter((r) => r.status === 409)) expect(refused.json.error.code).toBe("ALREADY_LINKED_ACCOUNT");
    const winner = race.find((r) => r.status === 200)!.json.data.account.userId;
    expect((await db.studentRecord.findUniqueOrThrow({ where: { id: one.id } })).userId).toBe(winner);
    // One audit row per link that happened, none for a refusal.
    expect(await db.auditLog.count({ where: { tenantId: a.id, targetId: one.id, action: "STUDENT_ACCOUNT_LINKED" } })).toBe(1);
  });
});

test.describe("a guardian's account", () => {
  test("the choices are the active members who sign in as a parent; link, the refusals and unlink behave as for a pupil, in words that name a guardian", async () => {
    const s = await pupil();
    const g = await guardianOf(s);
    const other = await guardianOf(s);
    const secondParent = await createUser({ name: "Paula Parent" });
    await addMembership(secondParent.id, a.id, Role.PARENT);

    const choices = await api(guardianUrl(g.id, "linkable-accounts"), as("admin"));
    expect(ids(choices)).toEqual(expect.arrayContaining([parent.id, secondParent.id]));
    for (const wrong of [learner.id, teacher.id, admin.id, outsider.id]) expect(ids(choices)).not.toContain(wrong);

    for (const userId of [learner.id, teacher.id, admin.id, foreignLearner.id, "nobody"]) {
      const res = await link(guardianUrl(g.id, "link-account"), userId);
      expect(res.status, userId).toBe(409);
      expect(res.json.error.code).toBe("ACCOUNT_MISMATCH");
      expect(res.json.error.message).toBe("Choose an active member of this school who signs in as a parent.");
    }
    const linked = await link(guardianUrl(g.id, "link-account"), parent.id);
    expect(linked.status, JSON.stringify(linked.json)).toBe(200);
    expect(linked.json.data.account).toMatchObject({
      state: "linked",
      userId: parent.id,
      name: "Pat Parent",
      role: "PARENT",
      roleDiffers: false,
    });
    // The pupil's guardians list shows it on the guardian.
    const links = await api(`${people()}/students/${s.id}/guardians`, as("admin"));
    const row = links.json.data.guardians.find((x: { guardian: { id: string } }) => x.guardian.id === g.id);
    expect(row.guardian.account).toMatchObject({ state: "linked", userId: parent.id });

    expect((await link(guardianUrl(g.id, "link-account"), secondParent.id)).json.error.code).toBe("ALREADY_LINKED_ACCOUNT");
    const taken = await link(guardianUrl(other.id, "link-account"), parent.id);
    expect(taken.json.error.code).toBe("ACCOUNT_TAKEN");
    expect(taken.json.error.message).toBe("That account is already linked to another guardian.");
    expect(await db.auditLog.count({ where: { tenantId: a.id, targetId: g.id, action: "GUARDIAN_ACCOUNT_LINKED" } })).toBe(1);

    const unlinked = await api(guardianUrl(g.id, "unlink-account"), as("admin", { method: "POST" }));
    expect(unlinked.json.data.account).toEqual({ state: "none" });
    expect((await api(guardianUrl(g.id, "unlink-account"), as("admin", { method: "POST" }))).json.error.code).toBe("NOT_LINKED");
    expect(await db.auditLog.count({ where: { tenantId: a.id, targetId: g.id, action: "GUARDIAN_ACCOUNT_UNLINKED" } })).toBe(1);
  });

  test("THE POINT: before the link a guardian's portal lists no child; after it, every child the school linked them to, and only those", async () => {
    const [first, second, stranger] = await Promise.all([pupil(), pupil(), pupil()]);
    const g = await guardianOf(first, second);
    const children = () => api(`/api/v1/schools/${a.code}/portal/practice/children`, as("parent"));
    expect((await children()).json.data.children).toEqual([]);

    expect((await link(guardianUrl(g.id, "link-account"), parent.id)).status).toBe(200);
    const seen = (await children()).json.data.children.map((c: { id: string }) => c.id);
    expect(seen.sort()).toEqual([first.id, second.id].sort());
    expect(seen).not.toContain(stranger.id);

    expect((await api(guardianUrl(g.id, "unlink-account"), as("admin", { method: "POST" }))).status).toBe(200);
    expect((await children()).json.data.children).toEqual([]);
  });
});

test.describe("a campus administrator", () => {
  test("links the pupils and the members of their OWN campus; another campus's pupil is 'no such student', another campus's member does not fit, and is not among the choices", async () => {
    const [north, south] = a.campuses;
    const northPupil = await pupil(north.id);
    const southPupil = await pupil(south.id);

    expect(ids(await api(studentUrl(northPupil.id, "linkable-accounts"), as("northAdmin")))).toContain(learner.id);
    expect(ids(await api(studentUrl(northPupil.id, "linkable-accounts"), as("northAdmin")))).not.toContain(southLearner.id);

    for (const [method, action, body] of [
      ["GET", "linkable-accounts", undefined],
      ["POST", "link-account", { userId: learner.id }],
      ["POST", "unlink-account", undefined],
    ] as const) {
      const res = await api(studentUrl(southPupil.id, action), as("northAdmin", { method, ...(body ? { body } : {}) }));
      expect(res.status, `${method} ${action}`).toBe(404);
      expect(res.json.error.code).toBe("NOT_FOUND");
    }
    const wrongCampus = await link(studentUrl(northPupil.id, "link-account"), southLearner.id, "northAdmin");
    expect(wrongCampus.status).toBe(409);
    expect(wrongCampus.json.error.code).toBe("ACCOUNT_MISMATCH");

    const linked = await link(studentUrl(northPupil.id, "link-account"), learner.id, "northAdmin");
    expect(linked.status, JSON.stringify(linked.json)).toBe(200);
    expect(
      (await db.auditLog.findFirstOrThrow({ where: { tenantId: a.id, targetId: northPupil.id, action: "STUDENT_ACCOUNT_LINKED" } }))
        .actorUserId,
    ).toBe(northAdmin.id);
    expect((await api(studentUrl(northPupil.id, "unlink-account"), as("northAdmin", { method: "POST" }))).status).toBe(200);
  });

  test("a guardian is theirs when a pupil of their campus is linked to them; a guardian of another campus's pupils only is 'no such guardian'", async () => {
    const [north, south] = a.campuses;
    const northPupil = await pupil(north.id);
    const southPupil = await pupil(south.id);
    const northGuardian = await guardianOf(northPupil);
    const southGuardian = await guardianOf(southPupil);
    const northParent = await createUser({ name: "Nkem North" });
    await addMembership(northParent.id, a.id, Role.PARENT, north.id);

    const choices = ids(await api(guardianUrl(northGuardian.id, "linkable-accounts"), as("northAdmin")));
    expect(choices).toContain(northParent.id);
    expect(choices).not.toContain(parent.id); // a parent with no campus is the school administrator's to link
    expect((await link(guardianUrl(northGuardian.id, "link-account"), northParent.id, "northAdmin")).status).toBe(200);

    for (const [method, action, body] of [
      ["GET", "linkable-accounts", undefined],
      ["POST", "link-account", { userId: northParent.id }],
      ["POST", "unlink-account", undefined],
    ] as const) {
      const res = await api(guardianUrl(southGuardian.id, action), as("northAdmin", { method, ...(body ? { body } : {}) }));
      expect(res.status, `${method} ${action}`).toBe(404);
      expect(res.json.error.code).toBe("NOT_FOUND");
    }
  });
});

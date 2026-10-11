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

// A campus administrator and the ACADEMICS of their campus over real HTTP (plan C1-C4, ADR 0016, slice B2): sessions and periods, classes and
// arms, attendance, announcements and the timetable. The same answers as the people routes: own campus works; another campus is a 404 identical to
// an unknown id; a school-wide row (visible, but it belongs to the whole school) is a 403; a new row defaults to their campus and cannot go
// anywhere else. Subjects, grade scales and assessment schemes are school-wide by nature and stay with the school administrator.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let admin: TestUser;
let campusAdmin: TestUser; // CAMPUS_ADMIN of North
let teacher: TestUser; // TEACHING_STAFF of North
const cookie: Record<string, string> = {};
let north: string;
let south: string;

const base = () => `/api/v1/schools/${a.code}`;
const as = (who: string, extra: object = {}) => ({ ...SAAS, cookie: cookie[who], ...extra });
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
async function cookieFor(user: TestUser) {
  const res = await loginAs(user, SAAS);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

// Every session needs a year of its own inside one campus scope (live sessions of a scope may not overlap).
let year = 2040;
const session = () => {
  year += 1;
  return db.academicSession.create({
    data: {
      tenantId: a.id,
      campusId: null,
      label: uniq("S"),
      startDate: new Date(`${year}-09-01`),
      endDate: new Date(`${year + 1}-07-01`),
    },
  });
};
const sessionOf = async (campusId: string | null) => db.academicSession.update({ where: { id: (await session()).id }, data: { campusId } });
/// A term inside `row` (a period outside its session is refused by the rules, so the dates follow the session's own year).
const period = (row: { id: string; startDate: Date }) => {
  const y = row.startDate.getUTCFullYear();
  return db.academicPeriod.create({
    data: {
      tenantId: a.id,
      sessionId: row.id,
      kind: "TERM",
      ordinal: 1,
      label: uniq("T"),
      startDate: new Date(`${y}-09-02`),
      endDate: new Date(`${y}-12-20`),
    },
  });
};
const group = (campusId: string | null) => db.classGroup.create({ data: { tenantId: a.id, campusId, name: uniq("Class ") } });
const arm = (classGroupId: string) => db.classArm.create({ data: { tenantId: a.id, classGroupId, name: uniq("Arm ") } });

/// [method, path under the school, body] for an action whose valid body is known; used for the refusal table.
type Call = readonly [string, string, object];

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Campus Academics School", campuses: ["North", "South"] });
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

test.describe("sessions and periods", () => {
  test("a new session defaults to the campus administrator's campus; another campus, or none, is a 403; an ADMIN is unchanged", async () => {
    const body = (over: Record<string, unknown> = {}) => ({
      label: uniq("Year "),
      startDate: "2100-09-01",
      endDate: "2101-07-01",
      ...over,
    });
    const made = await api(`${base()}/academics/sessions`, as("campusAdmin", { method: "POST", body: body() }));
    expect(made.status).toBe(201);
    expect((await db.academicSession.findUniqueOrThrow({ where: { id: made.json.data.session.id } })).campusId).toBe(north);
    expect((await api(`${base()}/academics/sessions`, as("campusAdmin", { method: "POST", body: body({ campusId: south }) }))).status).toBe(
      403,
    );
    expect((await api(`${base()}/academics/sessions`, as("campusAdmin", { method: "POST", body: body({ campusId: null }) }))).status).toBe(
      403,
    );
    expect(
      (
        await api(
          `${base()}/academics/sessions`,
          as("admin", { method: "POST", body: body({ campusId: south, startDate: "2102-09-01", endDate: "2103-07-01" }) }),
        )
      ).status,
    ).toBe(201);
    expect((await api(`${base()}/academics/sessions`, as("teacher", { method: "POST", body: body() }))).status).toBe(403);
  });

  test("update, archive and a period: own campus works; another campus is the same 404 as an unknown id; a school-wide session is 403", async () => {
    const [mine, theirs, wide] = [await sessionOf(north), await sessionOf(south), await sessionOf(null)];
    const myPeriod = await period(mine);
    const myYear = mine.startDate.getUTCFullYear();

    expect(
      (await api(`${base()}/academics/sessions/${mine.id}`, as("campusAdmin", { method: "PATCH", body: { label: "Renamed" } }))).status,
    ).toBe(200);
    const newPeriod = await api(
      `${base()}/academics/sessions/${mine.id}/periods`,
      as("campusAdmin", {
        method: "POST",
        body: { label: "Second term", startDate: `${myYear}-12-21`, endDate: `${myYear + 1}-03-30`, ordinal: 2 },
      }),
    );
    expect(newPeriod.status).toBe(201);
    expect(
      (await api(`${base()}/academics/periods/${myPeriod.id}`, as("campusAdmin", { method: "PATCH", body: { label: "First term" } })))
        .status,
    ).toBe(200);
    // "current" is for a running session: activate it by hand (the lifecycle routes are covered by the refusal table), then put it back
    await db.academicSession.update({ where: { id: mine.id }, data: { status: "ACTIVE" } });
    expect((await api(`${base()}/academics/periods/${myPeriod.id}/current`, as("campusAdmin", { method: "POST", body: {} }))).status).toBe(
      200,
    );
    await db.academicSession.update({ where: { id: mine.id }, data: { status: "PLANNED" } });

    const theirPeriod = await period(theirs);
    const widePeriod = await period(wide);
    const unknown = await api(
      `${base()}/academics/sessions/no-such-session`,
      as("campusAdmin", { method: "PATCH", body: { label: "Changed" } }),
    );
    expect(unknown.status).toBe(404);

    const refused = (row: { id: string }, periodId: string): Call[] => [
      ["PATCH", `/academics/sessions/${row.id}`, { label: "Hacked" }],
      [
        "POST",
        `/academics/sessions/${row.id}/periods`,
        { label: "Hacked", startDate: `${year}-10-01`, endDate: `${year}-11-01`, ordinal: 9 },
      ],
      ["POST", `/academics/sessions/${row.id}/activate`, {}],
      ["POST", `/academics/sessions/${row.id}/close`, {}],
      ["POST", `/academics/sessions/${row.id}/close/cancel`, {}],
      ["POST", `/academics/sessions/${row.id}/reopen`, { reason: "no" }],
      ["POST", `/academics/sessions/${row.id}/archive`, {}],
      ["POST", `/academics/sessions/${row.id}/copy-forward`, { startDate: "2150-09-01" }],
      ["PATCH", `/academics/periods/${periodId}`, { label: "Hacked" }],
      ["POST", `/academics/periods/${periodId}/archive`, {}],
      ["POST", `/academics/periods/${periodId}/current`, {}],
    ];
    for (const [method, path, payload] of refused(theirs, theirPeriod.id)) {
      const res = await api(`${base()}${path}`, as("campusAdmin", { method, body: payload }));
      expect([res.status, method, path], path).toEqual([404, method, path]);
      expect(res.json.error.code).toBe(unknown.json.error.code);
    }
    for (const [method, path, payload] of refused(wide, widePeriod.id)) {
      const res = await api(`${base()}${path}`, as("campusAdmin", { method, body: payload }));
      expect([res.status, method, path], path).toEqual([403, method, path]);
    }
    expect((await db.academicSession.findUniqueOrThrow({ where: { id: theirs.id } })).label).toBe(theirs.label);
    expect((await db.academicSession.findUniqueOrThrow({ where: { id: wide.id } })).label).toBe(wide.label);

    // the whole of an own-campus session can be archived again
    expect((await api(`${base()}/academics/periods/${myPeriod.id}/archive`, as("campusAdmin", { method: "POST", body: {} }))).status).toBe(
      200,
    );
    expect((await api(`${base()}/academics/sessions/${mine.id}/archive`, as("campusAdmin", { method: "POST", body: {} }))).status).toBe(
      200,
    );
  });

  test("the session list shows the campus administrator their campus's sessions and the school-wide ones, not another campus's", async () => {
    const [mine, theirs, wide] = [await sessionOf(north), await sessionOf(south), await sessionOf(null)];
    const res = await api(`${base()}/academics/sessions?limit=100`, as("campusAdmin"));
    expect(res.status).toBe(200);
    const ids = (res.json.data.sessions as { id: string }[]).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([mine.id, wide.id]));
    expect(ids).not.toContain(theirs.id);
  });
});

test.describe("classes and arms", () => {
  test("a new class defaults to the campus administrator's campus; another campus, or none, is a 403", async () => {
    const made = await api(`${base()}/academics/class-groups`, as("campusAdmin", { method: "POST", body: { name: uniq("JSS ") } }));
    expect(made.status).toBe(201);
    expect((await db.classGroup.findUniqueOrThrow({ where: { id: made.json.data.classGroup.id } })).campusId).toBe(north);
    for (const campusId of [south, null]) {
      expect(
        (await api(`${base()}/academics/class-groups`, as("campusAdmin", { method: "POST", body: { name: uniq("JSS "), campusId } })))
          .status,
      ).toBe(403);
    }
    expect(
      (await api(`${base()}/academics/class-groups`, as("admin", { method: "POST", body: { name: uniq("JSS "), campusId: south } })))
        .status,
    ).toBe(201);
  });

  test("classes, arms and subject offerings: own campus works; another campus is the same 404; a school-wide class is 403", async () => {
    const [mine, theirs, wide] = [await group(north), await group(south), await group(null)];
    const [myArm, theirArm, wideArm] = [await arm(mine.id), await arm(theirs.id), await arm(wide.id)];
    const subject = await db.subject.create({
      data: { tenantId: a.id, name: uniq("Subject "), code: `X${counter}${Date.now().toString(36)}`.toUpperCase() },
    });

    expect(
      (await api(`${base()}/academics/class-groups/${mine.id}`, as("campusAdmin", { method: "PATCH", body: { name: "Renamed" } }))).status,
    ).toBe(200);
    expect(
      (await api(`${base()}/academics/class-groups/${mine.id}/arms`, as("campusAdmin", { method: "POST", body: { name: uniq("New ") } })))
        .status,
    ).toBe(201);
    expect(
      (await api(`${base()}/academics/arms/${myArm.id}`, as("campusAdmin", { method: "PATCH", body: { name: "Renamed" } }))).status,
    ).toBe(200);
    expect(
      (
        await api(
          `${base()}/academics/class-groups/${mine.id}/subjects`,
          as("campusAdmin", { method: "PUT", body: { subjectIds: [subject.id] } }),
        )
      ).status,
    ).toBe(200);

    const unknown = await api(
      `${base()}/academics/class-groups/no-such-class`,
      as("campusAdmin", { method: "PATCH", body: { name: "Changed" } }),
    );
    expect(unknown.status).toBe(404);
    const refused = (g: { id: string }, r: { id: string }): Call[] => [
      ["PATCH", `/academics/class-groups/${g.id}`, { name: "Hacked" }],
      ["POST", `/academics/class-groups/${g.id}/archive`, {}],
      ["POST", `/academics/class-groups/${g.id}/arms`, { name: "Hacked" }],
      ["PUT", `/academics/class-groups/${g.id}/subjects`, { subjectIds: [subject.id] }],
      ["PATCH", `/academics/arms/${r.id}`, { name: "Hacked" }],
      ["POST", `/academics/arms/${r.id}/archive`, {}],
    ];
    for (const [method, path, payload] of refused(theirs, theirArm)) {
      const res = await api(`${base()}${path}`, as("campusAdmin", { method, body: payload }));
      expect([res.status, method, path], path).toEqual([404, method, path]);
      expect(res.json.error.code).toBe(unknown.json.error.code);
    }
    for (const [method, path, payload] of refused(wide, wideArm)) {
      const res = await api(`${base()}${path}`, as("campusAdmin", { method, body: payload }));
      expect([res.status, method, path], path).toEqual([403, method, path]);
    }
    expect((await api(`${base()}/academics/arms/${myArm.id}/archive`, as("campusAdmin", { method: "POST", body: {} }))).status).toBe(200);
    const spare = await group(north); // an empty class: one with live arms cannot be archived
    expect(
      (await api(`${base()}/academics/class-groups/${spare.id}/archive`, as("campusAdmin", { method: "POST", body: {} }))).status,
    ).toBe(200);
  });

  test("subjects, grade scales and assessment schemes belong to the whole school: a campus administrator cannot change them", async () => {
    const subject = await api(
      `${base()}/academics/subjects`,
      as("campusAdmin", { method: "POST", body: { name: uniq("Sub "), code: `Y${counter}${Date.now().toString(36)}`.toUpperCase() } }),
    );
    expect(subject.status).toBe(403);
    for (const path of ["grade-scales", "assessment-schemes"]) {
      expect((await api(`${base()}/academics/${path}`, as("campusAdmin", { method: "POST", body: { name: "Hacked" } }))).status, path).toBe(
        403,
      );
    }
    expect((await api(`${base()}/academics/results`, as("campusAdmin"))).status).toBe(403);
  });
});

test.describe("attendance", () => {
  const roll = (armId: string) => `${base()}/academics/arms/${armId}/attendance`;
  const today = () => new Date().toISOString().split("T")[0];
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().split("T")[0];

  async function enrolled(campusId: string | null) {
    const g = await group(campusId);
    const r = await arm(g.id);
    const s = await db.academicSession.create({
      data: {
        tenantId: a.id,
        campusId,
        label: uniq("A"),
        startDate: new Date("2020-09-01"),
        endDate: new Date("2021-07-01"),
        status: "ACTIVE",
      },
    });
    const pupil = await db.studentRecord.create({
      data: {
        tenantId: a.id,
        campusId,
        firstName: uniq("Pupil"),
        lastName: "Roll",
        dateOfBirth: new Date("2012-01-01"),
        admissionNo: uniq("AT/"),
      },
    });
    await db.studentEnrollment.create({
      data: { tenantId: a.id, sessionId: s.id, classArmId: r.id, studentId: pupil.id, status: "ACTIVE" },
    });
    return { arm: r, pupil };
  }

  test("a campus administrator takes and reads the roll of their campus's arms, and may correct an old date (as an ADMIN, unlike a teacher)", async () => {
    const mine = await enrolled(north);
    expect((await api(`${roll(mine.arm.id)}?date=${today()}`, as("campusAdmin"))).status).toBe(200);
    const mark = (date: string) => ({ date, records: [{ studentId: mine.pupil.id, status: "PRESENT" }] });
    expect((await api(roll(mine.arm.id), as("campusAdmin", { method: "POST", body: mark(today()) }))).status).toBe(200);
    expect((await api(roll(mine.arm.id), as("campusAdmin", { method: "POST", body: mark(daysAgo(60)) }))).status).toBe(200);
    expect((await api(roll(mine.arm.id), as("teacher", { method: "POST", body: mark(daysAgo(60)) }))).status).not.toBe(200); // the teacher's window is short
    expect((await api(roll(mine.arm.id), as("campusAdmin", { method: "POST", body: mark("2999-01-01") }))).status).toBeGreaterThanOrEqual(
      400,
    ); // never the future
    expect((await api(`${base()}/people/students/${mine.pupil.id}/attendance`, as("campusAdmin"))).status).toBe(200);
  });

  test("another campus's arm is the same 404 as an unknown one, for reading and for taking the roll; a school-wide arm can be read but not written; another campus's student has no history", async () => {
    const [theirs, wide] = [await enrolled(south), await enrolled(null)];
    const unknown = await api(roll("no-such-arm"), as("campusAdmin"));
    expect(unknown.status).toBe(404);
    const mark = (studentId: string) => ({ date: today(), records: [{ studentId, status: "ABSENT" }] });
    const read = await api(roll(theirs.arm.id), as("campusAdmin"));
    expect([read.status, read.json.error.code]).toEqual([404, unknown.json.error.code]);
    const write = await api(roll(theirs.arm.id), as("campusAdmin", { method: "POST", body: mark(theirs.pupil.id) }));
    expect([write.status, write.json.error.code]).toEqual([404, unknown.json.error.code]);
    expect((await api(roll(wide.arm.id), as("campusAdmin"))).status).toBe(200); // visible to them (row-level security hides the other campuses' pupils)
    expect((await api(roll(wide.arm.id), as("campusAdmin", { method: "POST", body: mark(wide.pupil.id) }))).status).toBe(403);
    expect(await db.attendanceRecord.count({ where: { studentId: { in: [theirs.pupil.id, wide.pupil.id] } } })).toBe(0);
    expect((await api(`${base()}/people/students/${theirs.pupil.id}/attendance`, as("campusAdmin"))).status).toBe(404);
  });
});

test.describe("announcements", () => {
  const body = (over: Record<string, unknown> = {}) => ({ title: uniq("Notice "), body: "Hello", ...over });
  const announce = (campusId: string | null, status: "DRAFT" | "PUBLISHED" = "PUBLISHED") =>
    db.announcement.create({
      data: {
        tenantId: a.id,
        campusId,
        title: uniq("Seeded "),
        body: "x",
        status,
        targetRoles: [],
        authorUserId: admin.id,
        publishedAt: new Date(Date.now() - 60_000),
      },
    });

  test("a new announcement defaults to the campus administrator's campus; another campus, none, or another campus's class is refused", async () => {
    const made = await api(`${base()}/announcements`, as("campusAdmin", { method: "POST", body: body() }));
    expect(made.status).toBe(201);
    expect((await db.announcement.findUniqueOrThrow({ where: { id: made.json.data.id } })).campusId).toBe(north);
    for (const campusId of [south, null]) {
      expect((await api(`${base()}/announcements`, as("campusAdmin", { method: "POST", body: body({ campusId }) }))).status).toBe(403);
    }
    const theirArm = await arm((await group(south)).id);
    const wideArm = await arm((await group(null)).id);
    expect(
      (await api(`${base()}/announcements`, as("campusAdmin", { method: "POST", body: body({ classArmId: theirArm.id }) }))).status,
    ).toBe(404);
    expect(
      (await api(`${base()}/announcements`, as("campusAdmin", { method: "POST", body: body({ classArmId: wideArm.id }) }))).status,
    ).toBe(403);
    expect((await api(`${base()}/announcements`, as("admin", { method: "POST", body: body({ campusId: null }) }))).status).toBe(201); // school-wide: the school administrator's
  });

  test("edit and delete: an own-campus announcement (even one an ADMIN wrote) works; another campus is the same 404; a school-wide one is 403", async () => {
    const [mine, theirs, wide] = [await announce(north), await announce(south), await announce(null)];
    expect(
      (await api(`${base()}/announcements/${mine.id}`, as("campusAdmin", { method: "PATCH", body: { title: "Edited" } }))).status,
    ).toBe(200);
    const unknown = await api(`${base()}/announcements/no-such-notice`, as("campusAdmin", { method: "PATCH", body: { title: "Edited" } }));
    expect(unknown.status).toBe(404);
    for (const method of ["PATCH", "DELETE"]) {
      const payload = method === "PATCH" ? { title: "Hacked" } : undefined;
      const res = await api(`${base()}/announcements/${theirs.id}`, as("campusAdmin", { method, body: payload }));
      expect([res.status, method]).toEqual([404, method]);
      expect(res.json.error.code).toBe(unknown.json.error.code);
      expect([(await api(`${base()}/announcements/${wide.id}`, as("campusAdmin", { method, body: payload }))).status, method]).toEqual([
        403,
        method,
      ]);
    }
    // an own-campus announcement may not be moved to another campus or to the whole school
    for (const campusId of [south, null]) {
      expect((await api(`${base()}/announcements/${mine.id}`, as("campusAdmin", { method: "PATCH", body: { campusId } }))).status).toBe(
        403,
      );
    }
    expect((await db.announcement.findUniqueOrThrow({ where: { id: mine.id } })).campusId).toBe(north);
    expect((await db.announcement.findUniqueOrThrow({ where: { id: theirs.id } })).title).toBe(theirs.title);
    expect((await api(`${base()}/announcements/${mine.id}`, as("campusAdmin", { method: "DELETE" }))).status).toBe(200);
  });

  test("the feed shows a campus administrator every announcement of their campus (drafts too) and the school-wide published ones, never another campus's", async () => {
    const [draft, theirDraft, wide, theirs] = [
      await announce(north, "DRAFT"),
      await announce(south, "DRAFT"),
      await announce(null),
      await announce(south),
    ];
    const res = await api(`${base()}/announcements?pageSize=100`, as("campusAdmin"));
    expect(res.status).toBe(200);
    const ids = (res.json.data.items as { id: string }[]).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining([draft.id, wide.id]));
    expect(ids).not.toEqual(expect.arrayContaining([theirDraft.id]));
    expect(ids).not.toContain(theirs.id);
  });
});

test.describe("timetable", () => {
  let subjectId: string;
  let staffId: string;
  let mineArm: { id: string };
  let theirArm: { id: string };
  let wideArm: { id: string };
  let day = 0;
  test.beforeAll(async () => {
    subjectId = (
      await db.subject.create({ data: { tenantId: a.id, name: uniq("TT "), code: `T${counter}${Date.now().toString(36)}`.toUpperCase() } })
    ).id;
    staffId = (
      await db.staffRecord.create({ data: { tenantId: a.id, campusId: null, category: "TEACHING", firstName: "Tim", lastName: "Table" } })
    ).id;
    mineArm = await arm((await group(north)).id);
    theirArm = await arm((await group(south)).id);
    wideArm = await arm((await group(null)).id);
  });
  // a free slot each time: distinct days keep two slots from clashing on the same teacher
  const slot = (classArmId: string, over: Record<string, unknown> = {}) => ({
    classArmId,
    subjectId,
    staffRecordId: staffId,
    dayOfWeek: (day = (day % 7) + 1),
    startTime: "08:00",
    endTime: "08:40",
    ...over,
  });
  // each seeded slot gets its own hour, so the one teacher never clashes with themselves
  let hour = 8;
  const seeded = (classArmId: string) => {
    hour += 1;
    const at = String(hour).padStart(2, "0");
    return db.timetableSlot.create({
      data: { tenantId: a.id, classArmId, subjectId, staffRecordId: staffId, dayOfWeek: 6, startTime: `${at}:00`, endTime: `${at}:40` },
    });
  };

  test("a campus administrator builds the timetable of their campus's arms; another campus's arm is a 404, a school-wide arm a 403", async () => {
    expect((await api(`${base()}/timetable`, as("campusAdmin", { method: "POST", body: slot(mineArm.id) }))).status).toBe(201);
    const unknown = await api(`${base()}/timetable`, as("campusAdmin", { method: "POST", body: slot("no-such-arm", { dayOfWeek: 5 }) }));
    const theirs = await api(`${base()}/timetable`, as("campusAdmin", { method: "POST", body: slot(theirArm.id, { dayOfWeek: 5 }) }));
    expect(theirs.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(theirs.json.error.code).toBe(unknown.json.error.code);
    expect((await api(`${base()}/timetable`, as("campusAdmin", { method: "POST", body: slot(wideArm.id, { dayOfWeek: 5 }) }))).status).toBe(
      403,
    );
    expect(await db.timetableSlot.count({ where: { classArmId: { in: [theirArm.id, wideArm.id] } } })).toBe(0);
  });

  test("change and remove a slot: own campus works; another campus's slot is the same 404; moving a slot onto another campus's arm is refused", async () => {
    const [mine, theirs, wide] = [await seeded(mineArm.id), await seeded(theirArm.id), await seeded(wideArm.id)];
    expect((await api(`${base()}/timetable/${mine.id}`, as("campusAdmin", { method: "PATCH", body: { room: "R1" } }))).status).toBe(200);
    expect(
      (await api(`${base()}/timetable/${mine.id}`, as("campusAdmin", { method: "PATCH", body: { classArmId: theirArm.id } }))).status,
    ).toBe(404);
    expect(
      (await api(`${base()}/timetable/${mine.id}`, as("campusAdmin", { method: "PATCH", body: { classArmId: wideArm.id } }))).status,
    ).toBe(403);
    expect((await db.timetableSlot.findUniqueOrThrow({ where: { id: mine.id } })).classArmId).toBe(mineArm.id);

    const unknown = await api(`${base()}/timetable/no-such-slot`, as("campusAdmin", { method: "PATCH", body: { room: "R2" } }));
    expect(unknown.status).toBe(404);
    for (const method of ["PATCH", "DELETE"]) {
      const payload = method === "PATCH" ? { room: "Hacked" } : undefined;
      const res = await api(`${base()}/timetable/${theirs.id}`, as("campusAdmin", { method, body: payload }));
      expect([res.status, method]).toEqual([404, method]);
      expect(res.json.error.code).toBe(unknown.json.error.code);
      expect([(await api(`${base()}/timetable/${wide.id}`, as("campusAdmin", { method, body: payload }))).status, method]).toEqual([
        403,
        method,
      ]);
    }
    expect(await db.timetableSlot.count({ where: { id: { in: [theirs.id, wide.id] } } })).toBe(2);
    expect((await api(`${base()}/timetable/${mine.id}`, as("campusAdmin", { method: "DELETE" }))).status).toBe(200);
  });

  test("a batch save is all-or-nothing about campuses: one slot on another campus's arm refuses the whole batch and writes nothing", async () => {
    const ok = await api(
      `${base()}/timetable/batch`,
      as("campusAdmin", {
        method: "POST",
        body: { classArmId: mineArm.id, slots: [slot(mineArm.id, { dayOfWeek: 2, startTime: "13:00", endTime: "13:40" })] },
      }),
    );
    expect(ok.status).toBe(200);
    const before = await db.timetableSlot.count({ where: { tenantId: a.id } });
    const mixed = await api(
      `${base()}/timetable/batch`,
      as("campusAdmin", {
        method: "POST",
        body: {
          slots: [
            slot(mineArm.id, { dayOfWeek: 3, startTime: "14:00", endTime: "14:40" }),
            slot(theirArm.id, { dayOfWeek: 3, startTime: "15:00", endTime: "15:40" }),
          ],
        },
      }),
    );
    expect(mixed.status).toBe(404);
    const replace = await api(
      `${base()}/timetable/batch`,
      as("campusAdmin", {
        method: "POST",
        body: {
          classArmId: theirArm.id,
          replaceExisting: true,
          slots: [slot(mineArm.id, { dayOfWeek: 4, startTime: "16:00", endTime: "16:40" })],
        },
      }),
    );
    expect(replace.status).toBe(404);
    expect(await db.timetableSlot.count({ where: { tenantId: a.id } })).toBe(before);
  });
});

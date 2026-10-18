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

// Who may read a class arm's roll call and a student's attendance history, and who may take the roll (task 0010 F3, ISS-0013, plan "Build design -
// platform follow-ups"). Two rules, both over real HTTP:
//   CAMPUS: the arm's class group / the student must be school-wide or in the member's own campus (a member with no campus is school-wide).
//   ARM (teaching staff only): the arm must be one the teacher is assigned to - a subject assignment or a timetable slot of their staff record - and a
//   student's history is readable if the student has an ACTIVE enrolment in such an arm in the active session. Non-teaching staff (a registrar) have no
//   arms by nature and get the campus rule only. ADMIN and CAMPUS_ADMIN are unchanged (the latter by the campus rule they already had).
// Anything out of scope answers exactly like an unknown id (404, same code): it must not confirm the arm or the student exists. The same rule guards the
// roll-call WRITE for a teacher: one who cannot read an arm must not be able to write to it.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let north: string;
let south: string;
const users: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
const arm: Record<string, string> = {}; // northOne, northTwo, southOne, wideOne
const student: Record<string, string> = {};
let subjectId: string;
let sessionId: string;
const today = new Date().toISOString().split("T")[0];

const as = (who: string, extra: object = {}) => ({ ...SAAS, cookie: cookie[who], ...extra });
const school = () => `/api/v1/schools/${a.code}`;
const roll = (armId: string, who: string, extra: object = {}) =>
  api(`${school()}/academics/arms/${armId}/attendance?date=${today}`, as(who, extra));
const history = (studentId: string, who: string) => api(`${school()}/people/students/${studentId}/attendance`, as(who));
async function cookieFor(user: TestUser) {
  const res = await loginAs(user, SAAS);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

/// A teacher: a sign-in membership (in `campusId`, or school-wide when null) and a staff record linked to it.
async function teacher(name: string, campusId: string | null) {
  const user = await createUser({ name });
  await addMembership(user.id, a.id, Role.TEACHING_STAFF, campusId);
  const staff = await db.staffRecord.create({
    data: { tenantId: a.id, campusId, userId: user.id, category: "TEACHING", firstName: name, lastName: "Teacher" },
  });
  users[name] = user;
  return staff;
}
const assign = (staffRecordId: string, classArmId: string) =>
  db.staffSubjectAssignment.create({ data: { tenantId: a.id, staffRecordId, subjectId, classArmId } });

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Roll Call Access School", campuses: ["North", "South"] });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  sessionId = (
    await db.academicSession.create({
      data: { tenantId: a.id, label: "2046", startDate: new Date("2046-09-01"), endDate: new Date("2047-07-01"), status: "ACTIVE" },
    })
  ).id;
  subjectId = (await db.subject.create({ data: { tenantId: a.id, name: "Mathematics", code: "MTHACC" } })).id;

  // structure: two arms in a North group, one in a South group, one in a school-wide group
  const groups = {
    north: await db.classGroup.create({ data: { tenantId: a.id, campusId: north, name: "North JSS 1", sortOrder: 1 } }),
    south: await db.classGroup.create({ data: { tenantId: a.id, campusId: south, name: "South JSS 1", sortOrder: 2 } }),
    wide: await db.classGroup.create({ data: { tenantId: a.id, campusId: null, name: "Whole School", sortOrder: 3 } }),
  };
  const mk = async (key: string, classGroupId: string, name: string) =>
    (arm[key] = (await db.classArm.create({ data: { tenantId: a.id, classGroupId, name } })).id);
  await mk("northOne", groups.north.id, "A");
  await mk("northTwo", groups.north.id, "B");
  await mk("southOne", groups.south.id, "A");
  await mk("wideOne", groups.wide.id, "A");
  // one pupil per arm (the pupil belongs to the campus of their arm; the school-wide arm's pupil has no campus)
  const pupil = async (key: string, armKey: string, campusId: string | null, n: number) => {
    const s = await db.studentRecord.create({
      data: {
        tenantId: a.id,
        campusId,
        firstName: `Pupil${n}`,
        lastName: "Roll",
        dateOfBirth: new Date("2013-03-03"),
        admissionNo: `RC/${n}`,
      },
    });
    await db.studentEnrollment.create({ data: { tenantId: a.id, sessionId, classArmId: arm[armKey], studentId: s.id, status: "ACTIVE" } });
    student[key] = s.id;
  };
  await pupil("northOne", "northOne", north, 1);
  await pupil("northTwo", "northTwo", north, 2);
  await pupil("southOne", "southOne", south, 3);
  await pupil("wideOne", "wideOne", null, 4);

  users.admin = await createUser({ name: "Ada Admin" });
  await addMembership(users.admin.id, a.id, Role.ADMIN);
  users.campusAdmin = await createUser({ name: "Cam Campusadmin" });
  await addMembership(users.campusAdmin.id, a.id, Role.CAMPUS_ADMIN, north);
  users.registrar = await createUser({ name: "Reg Registrar" });
  await addMembership(users.registrar.id, a.id, Role.NON_TEACHING_STAFF, north);
  users.parent = await createUser({ name: "Pat Parent" });
  await addMembership(users.parent.id, a.id, Role.PARENT);

  // teachers
  const northOneAndWide = await teacher("tNorth", north); // assigned to northOne and the school-wide arm
  await assign(northOneAndWide.id, arm.northOne);
  await assign(northOneAndWide.id, arm.wideOne);
  const timetabled = await teacher("tNorthTimetable", north); // NOT assigned; has a timetable slot in northTwo
  await db.timetableSlot.create({
    data: {
      tenantId: a.id,
      classArmId: arm.northTwo,
      subjectId,
      staffRecordId: timetabled.id,
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "08:45",
    },
  });
  await teacher("tNone", north); // no assignment at all
  const southTeachingNorth = await teacher("tSouthAssignedNorth", south); // assigned to a North arm, but belongs to the South campus
  await assign(southTeachingNorth.id, arm.northOne);
  const wideTeacher = await teacher("tWide", null); // school-wide teacher assigned to South's arm and the school-wide one
  await assign(wideTeacher.id, arm.southOne);
  await assign(wideTeacher.id, arm.wideOne);
  const unlinked = await createUser({ name: "tUnlinked" }); // a teaching member with NO staff record at all
  await addMembership(unlinked.id, a.id, Role.TEACHING_STAFF, north);
  users.tUnlinked = unlinked;

  for (const [who, user] of Object.entries(users)) cookie[who] = await cookieFor(user);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("reading a roll call", () => {
  const matrix: [string, string, number][] = [
    // [who, arm, expected status]
    ["tNorth", "northOne", 200], // assigned
    ["tNorth", "wideOne", 200], // assigned to a school-wide arm
    ["tNorth", "northTwo", 404], // own campus, but not theirs to teach
    ["tNorth", "southOne", 404], // another campus
    ["tNorthTimetable", "northTwo", 200], // assigned through the timetable only
    ["tNorthTimetable", "northOne", 404],
    ["tNone", "northOne", 404], // no assignment: nothing
    ["tNone", "wideOne", 404],
    ["tSouthAssignedNorth", "northOne", 404], // assigned, but another campus wins
    ["tWide", "southOne", 200], // a school-wide teacher has no campus limit, only the assignment
    ["tWide", "wideOne", 200],
    ["tWide", "northOne", 404], // not assigned
    ["tUnlinked", "northOne", 404], // a teaching member with no staff record has no arm
    ["registrar", "northOne", 200], // non-teaching staff: the campus rule only
    ["registrar", "northTwo", 200],
    ["registrar", "wideOne", 200],
    ["registrar", "southOne", 404],
    ["campusAdmin", "northTwo", 200],
    ["campusAdmin", "wideOne", 200],
    ["campusAdmin", "southOne", 404],
    ["admin", "northOne", 200],
    ["admin", "southOne", 200],
    ["admin", "wideOne", 200],
  ];
  for (const [who, which, status] of matrix) {
    test(`${who} reading ${which}: ${status}`, async () => {
      const res = await roll(arm[which], who);
      expect(res.status, res.text).toBe(status);
    });
  }

  test("an arm out of scope answers exactly like an unknown id, so it confirms nothing", async () => {
    const unknown = await roll("no-such-arm-id-0000000000", "tNorth");
    expect(unknown.status).toBe(404);
    for (const [who, which] of [
      ["tNorth", "southOne"],
      ["tNone", "northOne"],
      ["registrar", "southOne"],
    ]) {
      const res = await roll(arm[which], who);
      expect([res.status, res.json.error.code, res.json.error.message]).toEqual([404, unknown.json.error.code, unknown.json.error.message]);
    }
  });

  test("a parent is still refused, as before", async () => {
    expect((await roll(arm.northOne, "parent")).status).toBe(403);
  });
});

test.describe("reading a student's history", () => {
  const matrix: [string, string, number][] = [
    ["tNorth", "northOne", 200], // enrolled in an assigned arm
    ["tNorth", "wideOne", 200], // school-wide pupil in an assigned school-wide arm
    ["tNorth", "northTwo", 404], // enrolled in an arm that is not theirs
    ["tNorth", "southOne", 404],
    ["tNorthTimetable", "northTwo", 200],
    ["tNone", "northOne", 404],
    ["tSouthAssignedNorth", "northOne", 404],
    ["tWide", "southOne", 200],
    ["tWide", "northOne", 404],
    ["tUnlinked", "northOne", 404],
    ["registrar", "northOne", 200],
    ["registrar", "northTwo", 200],
    ["registrar", "wideOne", 200],
    ["registrar", "southOne", 404],
    ["campusAdmin", "northTwo", 200],
    ["campusAdmin", "southOne", 404],
    ["admin", "southOne", 200],
  ];
  for (const [who, which, status] of matrix) {
    test(`${who} reading the history of the ${which} pupil: ${status}`, async () => {
      const res = await history(student[which], who);
      expect(res.status, res.text).toBe(status);
    });
  }

  test("an unassigned pupil answers exactly like an unknown id", async () => {
    const unknown = await history("no-such-student-id-00000000", "tNorth");
    expect(unknown.status).toBe(404);
    const res = await history(student.southOne, "tNorth");
    expect([res.status, res.json.error.code]).toEqual([404, unknown.json.error.code]);
  });

  test("a pupil who has left the assigned arm (not an ACTIVE enrolment) is no longer readable by that teacher", async () => {
    const leaver = await db.studentRecord.create({
      data: {
        tenantId: a.id,
        campusId: north,
        firstName: "Leaver",
        lastName: "Roll",
        dateOfBirth: new Date("2013-03-03"),
        admissionNo: "RC/9",
      },
    });
    await db.studentEnrollment.create({
      data: { tenantId: a.id, sessionId, classArmId: arm.northOne, studentId: leaver.id, status: "WITHDRAWN" },
    });
    expect((await history(leaver.id, "tNorth")).status).toBe(404);
    expect((await history(leaver.id, "admin")).status).toBe(200);
  });
});

test.describe("taking the roll", () => {
  const body = (studentId: string) => ({ method: "POST", body: { date: today, records: [{ studentId, status: "PRESENT" }] } });
  const marked = (studentId: string) => db.attendanceRecord.count({ where: { tenantId: a.id, studentId } });

  test("a teacher takes the roll of an arm they are assigned to; of any other arm it is a 404 and nothing is written", async () => {
    expect((await roll(arm.northOne, "tNorth", body(student.northOne))).status).toBe(200);
    expect(await marked(student.northOne)).toBe(1);
    for (const [which, who] of [
      ["northTwo", "tNorth"], // own campus, not theirs
      ["southOne", "tNorth"], // another campus
      ["northOne", "tNone"], // no assignment
      ["northOne", "tSouthAssignedNorth"], // wrong campus
    ]) {
      const res = await roll(arm[which], who, body(student[which]));
      expect([res.status, who, which], `${who} → ${which}`).toEqual([404, who, which]);
      expect(await marked(student[which]), `${who} wrote to ${which}`).toBe(which === "northOne" ? 1 : 0);
    }
  });

  test("a school administrator and a campus administrator are unchanged", async () => {
    expect((await roll(arm.southOne, "admin", body(student.southOne))).status).toBe(200);
    expect((await roll(arm.northTwo, "campusAdmin", body(student.northTwo))).status).toBe(200);
    expect((await roll(arm.southOne, "campusAdmin", body(student.southOne))).status).toBe(404);
  });
});

test.describe("the list of arms to take a roll for", () => {
  const list = async (who: string) => {
    const res = await api(`${school()}/academics/attendance/arms`, as(who));
    expect(res.status, `${who}: ${res.text}`).toBe(200);
    return (res.json.data.arms as { id: string }[]).map((x) => x.id).sort();
  };
  const ids = (...keys: string[]) => keys.map((k) => arm[k]).sort();

  test("each person is offered exactly the arms they can read - teachers only their own", async () => {
    expect(await list("tNorth")).toEqual(ids("northOne", "wideOne"));
    expect(await list("tNorthTimetable")).toEqual(ids("northTwo"));
    expect(await list("tNone")).toEqual([]);
    expect(await list("tSouthAssignedNorth")).toEqual([]);
    expect(await list("tWide")).toEqual(ids("southOne", "wideOne"));
    expect(await list("registrar")).toEqual(ids("northOne", "northTwo", "wideOne"));
    expect(await list("campusAdmin")).toEqual(ids("northOne", "northTwo", "wideOne"));
    expect(await list("admin")).toEqual(ids("northOne", "northTwo", "southOne", "wideOne"));
  });

  test("an archived arm is not offered; a parent is refused; signed out is 401", async () => {
    const gone = await db.classArm.create({
      data: {
        tenantId: a.id,
        classGroupId: (await db.classArm.findUniqueOrThrow({ where: { id: arm.northOne } })).classGroupId,
        name: "Z",
        archivedAt: new Date(),
      },
    });
    expect(await list("admin")).not.toContain(gone.id);
    expect((await api(`${school()}/academics/attendance/arms`, as("parent"))).status).toBe(403);
    expect((await api(`${school()}/academics/attendance/arms`, { ...SAAS })).status).toBe(401);
  });
});

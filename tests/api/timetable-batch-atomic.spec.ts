import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// A timetable batch is all or nothing (ADR 0002: a refusal after a write must roll back). It may REPLACE a class arm's whole timetable (`replaceExisting`), and a batch that
// is refused, for a clash with another arm's lesson or a teacher's other lesson, or for a reference that is not in this school, must leave EVERYTHING as it was: nothing deleted,
// nothing added. The slots the arm is replacing never count as clashes for the new ones.

let a: TestTenant;
let b: TestTenant;
let cookieAdmin: string;
let groupId: string;
let math: { id: string };
let english: { id: string };
let teacherOtherSchool: { id: string };
let subjectOtherSchool: { id: string };

let seq = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++seq}`;
const batch = (body: object) =>
  api(`/api/v1/schools/${a.code}/timetable/batch`, { method: "POST", body, cookie: cookieAdmin, baseUrl: SAAS_URL });
const arm = (over: { archived?: boolean } = {}) =>
  db.classArm.create({
    data: { tenantId: a.id, classGroupId: groupId, name: uniq("Arm "), archivedAt: over.archived ? new Date() : null },
  });
const lesson = (classArmId: string, staffRecordId: string, dayOfWeek: number, startTime: string, endTime: string, subjectId = math.id) => ({
  classArmId,
  subjectId,
  staffRecordId,
  dayOfWeek,
  startTime,
  endTime,
});
/// An arm's slots as they are in the database, in a stable order.
const slotsOf = (classArmId: string) =>
  db.timetableSlot.findMany({
    where: { classArmId },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    select: { id: true, dayOfWeek: true, startTime: true, endTime: true, staffRecordId: true },
  });
/// Two teachers of their own for each test: a teacher is clash-checked across the whole school, so tests that shared one would clash with each other's lessons.
const teachers = () =>
  Promise.all(
    ["One", "Two"].map((firstName) =>
      db.staffRecord.create({ data: { tenantId: a.id, category: "TEACHING", firstName, lastName: uniq("T") } }),
    ),
  );
const seed = (...slots: ReturnType<typeof lesson>[]) => db.timetableSlot.createMany({ data: slots.map((s) => ({ tenantId: a.id, ...s })) });

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Atomic Timetable School" });
  b = await createTenant({ name: "Other Timetable School" });
  const admin = await createUser({ name: "Ada Admin" });
  await addMembership(admin.id, a.id, Role.ADMIN);
  const login = await loginAs(admin, { baseUrl: SAAS_URL });
  expect(login.status).toBe(200);
  cookieAdmin = cookieHeader(login.token!);

  groupId = (await db.classGroup.create({ data: { tenantId: a.id, name: "Grade 9" } })).id;
  math = await db.subject.create({ data: { tenantId: a.id, name: "Mathematics", code: "MTH9" } });
  english = await db.subject.create({ data: { tenantId: a.id, name: "English", code: "ENG9" } });
  teacherOtherSchool = await db.staffRecord.create({
    data: { tenantId: b.id, category: "TEACHING", firstName: "Other", lastName: "Teacher" },
  });
  subjectOtherSchool = await db.subject.create({ data: { tenantId: b.id, name: "Physics", code: "PHY9" } });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("a refused batch changes nothing", () => {
  test("a clash with another arm's lesson leaves the arm's existing timetable exactly as it was", async () => {
    const [t1, t2] = await teachers();
    const x = await arm();
    const y = await arm();
    await seed(lesson(x.id, t1.id, 1, "08:00", "09:00"), lesson(x.id, t1.id, 2, "09:00", "10:00"));
    await seed(lesson(y.id, t2.id, 1, "10:00", "11:00", english.id));
    const xBefore = await slotsOf(x.id);
    const yBefore = await slotsOf(y.id);
    expect(xBefore).toHaveLength(2);

    // teacher 2 is teaching arm Y on Monday 10:00-11:00, so this replacement cannot be saved
    const res = await batch({ classArmId: x.id, replaceExisting: true, slots: [lesson(x.id, t2.id, 1, "10:30", "11:30")] });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("TIMETABLE_CLASH");

    expect(await slotsOf(x.id)).toEqual(xBefore);
    expect(await slotsOf(y.id)).toEqual(yBefore);
  });

  test("a clash without replaceExisting adds none of the batch's lessons", async () => {
    const [t1, t2] = await teachers();
    const x = await arm();
    const y = await arm();
    await seed(lesson(x.id, t1.id, 1, "08:00", "09:00"));
    await seed(lesson(y.id, t2.id, 3, "10:00", "11:00", english.id));
    const xBefore = await slotsOf(x.id);

    const res = await batch({
      classArmId: x.id,
      slots: [lesson(x.id, t1.id, 4, "08:00", "09:00"), lesson(x.id, t2.id, 3, "10:30", "11:30")], // the second clashes with arm Y
    });
    expect(res.status).toBe(409);
    expect(await slotsOf(x.id)).toEqual(xBefore);
  });

  test("a batch that clashes with itself changes nothing", async () => {
    const [t1] = await teachers();
    const x = await arm();
    await seed(lesson(x.id, t1.id, 1, "08:00", "09:00"));
    const xBefore = await slotsOf(x.id);
    const res = await batch({
      classArmId: x.id,
      replaceExisting: true,
      slots: [lesson(x.id, t1.id, 5, "08:00", "09:00"), lesson(x.id, t1.id, 5, "08:30", "09:30")],
    });
    expect(res.status).toBe(409);
    expect(await slotsOf(x.id)).toEqual(xBefore);
  });

  test("a reference that is not in this school is a 400 and changes nothing: an unknown subject, another school's teacher or subject, an archived arm", async () => {
    const [t1] = await teachers();
    const x = await arm();
    const archived = await arm({ archived: true });
    await seed(lesson(x.id, t1.id, 1, "08:00", "09:00"));
    const xBefore = await slotsOf(x.id);

    for (const [label, slot] of [
      ["unknown subject", lesson(x.id, t1.id, 2, "08:00", "09:00", "cl0000000000000000000000x")],
      ["another school's subject", lesson(x.id, t1.id, 2, "08:00", "09:00", subjectOtherSchool.id)],
      ["another school's teacher", lesson(x.id, teacherOtherSchool.id, 2, "08:00", "09:00")],
      ["unknown arm", lesson("cl0000000000000000000000x", t1.id, 2, "08:00", "09:00")],
      ["archived arm", lesson(archived.id, t1.id, 2, "08:00", "09:00")],
    ] as const) {
      const res = await batch({ classArmId: x.id, replaceExisting: true, slots: [slot] });
      expect(res.status, label).toBe(400);
      expect(res.json.error.code, label).toBe("INVALID_FOREIGN_KEY");
      expect(await slotsOf(x.id), label).toEqual(xBefore);
    }
    expect(await slotsOf(archived.id)).toEqual([]);
  });
});

test.describe("a batch that is accepted", () => {
  test("replaces the arm's timetable; the lessons it replaces do not clash with their own replacements", async () => {
    const [t1, t2] = await teachers();
    const x = await arm();
    const y = await arm();
    await seed(lesson(x.id, t1.id, 1, "08:00", "09:00"), lesson(x.id, t1.id, 2, "09:00", "10:00"));
    await seed(lesson(y.id, t2.id, 1, "10:00", "11:00", english.id));
    const yBefore = await slotsOf(y.id);
    const oldIds = (await slotsOf(x.id)).map((s) => s.id);

    // Monday 08:00-09:00 with the same teacher is exactly the lesson being replaced; Wednesday is new
    const res = await batch({
      classArmId: x.id,
      replaceExisting: true,
      slots: [lesson(x.id, t1.id, 1, "08:00", "09:00"), lesson(x.id, t1.id, 3, "09:00", "10:00", english.id)],
    });
    expect(res.status).toBe(200);
    expect(res.json.data.savedCount).toBe(2);

    const now = await slotsOf(x.id);
    expect(now.map((s) => [s.dayOfWeek, s.startTime])).toEqual([
      [1, "08:00"],
      [3, "09:00"],
    ]);
    expect(now.some((s) => oldIds.includes(s.id))).toBe(false); // the old rows are gone
    expect(await slotsOf(y.id)).toEqual(yBefore); // another arm is never touched
  });

  test("adds to the arm's timetable when replaceExisting is off", async () => {
    const [t1] = await teachers();
    const x = await arm();
    await seed(lesson(x.id, t1.id, 1, "08:00", "09:00"));
    const res = await batch({ classArmId: x.id, slots: [lesson(x.id, t1.id, 2, "08:00", "09:00")] });
    expect(res.status).toBe(200);
    expect(await slotsOf(x.id)).toHaveLength(2);
  });
});

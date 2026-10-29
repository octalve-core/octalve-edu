import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Changing one lesson (PATCH /timetable/[id]): the start has to stay before the end whichever of the two is sent. A request that sends only one of them is judged
// against the other one as stored; before, that range was never checked and the database's own constraint refused it (a 500).

let a: TestTenant;
let cookieAdmin: string;
let groupId: string;
let math: { id: string };
let seq = 0;

const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++seq}`;
const patch = (id: string, body: object) =>
  api(`/api/v1/schools/${a.code}/timetable/${id}`, { method: "PATCH", body, cookie: cookieAdmin, baseUrl: SAAS_URL });

/// A lesson on Monday 09:00-10:00 of an arm and a teacher of their own.
async function lesson() {
  const arm = await db.classArm.create({ data: { tenantId: a.id, classGroupId: groupId, name: uniq("Arm ") } });
  const teacher = await db.staffRecord.create({ data: { tenantId: a.id, category: "TEACHING", firstName: "Tee", lastName: uniq("T") } });
  return db.timetableSlot.create({
    data: {
      tenantId: a.id,
      classArmId: arm.id,
      subjectId: math.id,
      staffRecordId: teacher.id,
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
    },
  });
}
const times = async (id: string) => {
  const row = await db.timetableSlot.findUniqueOrThrow({ where: { id }, select: { startTime: true, endTime: true } });
  return `${row.startTime}-${row.endTime}`;
};

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Slot Times School" });
  const admin = await createUser({ name: "Ada Admin" });
  await addMembership(admin.id, a.id, Role.ADMIN);
  const login = await loginAs(admin, { baseUrl: SAAS_URL });
  expect(login.status).toBe(200);
  cookieAdmin = cookieHeader(login.token!);
  groupId = (await db.classGroup.create({ data: { tenantId: a.id, name: "Grade 7" } })).id;
  math = await db.subject.create({ data: { tenantId: a.id, name: "Mathematics", code: "MTH7" } });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("changing one lesson's time", () => {
  test("a start at or after the stored end, or an end at or before the stored start, is a 400 and the lesson is unchanged", async () => {
    const slot = await lesson();
    for (const body of [{ startTime: "10:30" }, { startTime: "10:00" }, { endTime: "08:30" }, { endTime: "09:00" }]) {
      const res = await patch(slot.id, body);
      expect.soft(res.status, `${JSON.stringify(body)}: ${res.text}`).toBe(400);
    }
    expect(await times(slot.id)).toBe("09:00-10:00");
  });

  test("a change that keeps the start before the end is accepted, one time or both (control)", async () => {
    const slot = await lesson();
    expect((await patch(slot.id, { startTime: "09:30" })).status).toBe(200);
    expect(await times(slot.id)).toBe("09:30-10:00");
    expect((await patch(slot.id, { endTime: "11:00" })).status).toBe(200);
    expect(await times(slot.id)).toBe("09:30-11:00");
    expect((await patch(slot.id, { startTime: "13:00", endTime: "14:00" })).status).toBe(200);
    expect(await times(slot.id)).toBe("13:00-14:00");
  });

  test("both times sent in the wrong order stay a 400 (control)", async () => {
    const slot = await lesson();
    const res = await patch(slot.id, { startTime: "11:00", endTime: "10:00" });
    expect(res.status).toBe(400);
    expect(await times(slot.id)).toBe("09:00-10:00");
  });
});

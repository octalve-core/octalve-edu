import "../support/env";
import { Role } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";

// `pnpm teachers:unassigned [-- <school-code>]`: the check to run BEFORE deploying the attendance rule of task 0010 F3 (ISS-0013) to a school - a
// teacher reads and writes only the arms they are assigned to, so every teacher it lists will see no class until an administrator assigns them.
// Read-only. Run here as the real script, as a child process, against the test database.

const run = promisify(execFile);
const script = (...args: string[]) =>
  run(process.execPath, ["scripts/unassigned-teachers.mjs", ...args], { env: process.env, cwd: process.cwd() }).then(
    (r) => ({ code: 0, out: r.stdout, err: r.stderr }),
    (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout, err: e.stderr }),
  );

let school: TestTenant;
test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Unassigned Check School", campuses: ["Only"] });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

async function teacher(name: string, opts: { staff?: boolean; assigned?: "subject" | "slot"; deactivated?: boolean } = {}) {
  const user = await createUser({ name });
  await addMembership(user.id, school.id, Role.TEACHING_STAFF, school.campuses[0].id);
  if (opts.deactivated) {
    await db.tenantMembership.update({
      where: { userId_tenantId: { userId: user.id, tenantId: school.id } },
      data: { deactivatedAt: new Date() },
    });
  }
  if (opts.staff !== false) {
    const staff = await db.staffRecord.create({
      data: { tenantId: school.id, userId: user.id, category: "TEACHING", firstName: name, lastName: "T" },
    });
    if (opts.assigned) {
      const group = await db.classGroup.create({ data: { tenantId: school.id, name: `G-${name}`, sortOrder: 1 } });
      const arm = await db.classArm.create({ data: { tenantId: school.id, classGroupId: group.id, name: "A" } });
      const subject = await db.subject.create({
        data: { tenantId: school.id, name: `S-${name}`, code: `UT${Math.random().toString(36).slice(2, 7).toUpperCase()}` },
      });
      if (opts.assigned === "subject") {
        await db.staffSubjectAssignment.create({
          data: { tenantId: school.id, staffRecordId: staff.id, subjectId: subject.id, classArmId: arm.id },
        });
      } else {
        await db.timetableSlot.create({
          data: {
            tenantId: school.id,
            classArmId: arm.id,
            subjectId: subject.id,
            staffRecordId: staff.id,
            dayOfWeek: 1,
            startTime: "08:00",
            endTime: "08:45",
          },
        });
      }
    }
  }
  return user;
}

test.describe("scripts/unassigned-teachers.mjs", () => {
  test("lists exactly the active teaching members who would see no arm: no staff record, or a staff record with no assignment and no timetable slot", async () => {
    const bySubject = await teacher("Has Subject", { assigned: "subject" });
    const bySlot = await teacher("Has Slot", { assigned: "slot" });
    const idle = await teacher("Idle One");
    const noRecord = await teacher("No Record", { staff: false });
    const gone = await teacher("Gone One", { deactivated: true });

    const res = await script(school.code);
    expect(res.code, res.err).toBe(0);
    expect(res.out).toContain(idle.email);
    expect(res.out).toContain(noRecord.email);
    for (const fine of [bySubject, bySlot, gone]) expect(res.out).not.toContain(fine.email);
    expect(res.out).toMatch(/2 of 4 active teaching staff/i); // 4 active teachers, 2 would see no class
  });

  test("a school where everyone is assigned says so; an unknown code fails; with no code every school is reported; it writes nothing", async () => {
    const fresh = await createTenant({ name: "All Assigned School", campuses: ["Only"] });
    const before = await db.auditLog.count();
    expect((await script(fresh.code)).out).toMatch(/no active teaching staff|every active teaching/i);
    expect((await script("no-such-school")).code).toBe(1);
    const all = await script();
    expect(all.code, all.err).toBe(0);
    expect(all.out).toContain(school.code);
    expect(all.out).toContain(fresh.code);
    expect(await db.auditLog.count()).toBe(before);
  });
});

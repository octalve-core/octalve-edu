import "../support/env";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";

// The rules the database itself states for standing (task 0028, migration 20261115090000_standing) and for the generic settings table (task 0027 slice P0, migration
// 20261114090000_tenant_settings_part_payment): CHECK constraints, the append-only history and row-level security. The services check the same things first and say why; these
// prove the database would refuse even if one did not. The runtime role (`app_user`, through `forTenant`) is the one that must be unable to rewrite the history.

let a: TestTenant;
let b: TestTenant;
let admin: { id: string };
const asSchool = (t: TestTenant) => forTenant(trustedTenantId(t.id));

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Standing schema A", campuses: ["North"] });
  b = await createTenant({ name: "Standing schema B" });
  admin = await createUser();
  await addMembership(admin.id, a.id, Role.ADMIN);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

let counter = 0;
const student = (tenantId: string, over: Record<string, unknown> = {}) =>
  db.studentRecord.create({
    data: {
      tenantId,
      firstName: "Sade",
      lastName: "Okoro",
      dateOfBirth: new Date("2012-05-01"),
      admissionNo: `ST/${Date.now().toString(36)}${++counter}`,
      ...over,
    },
  });
const staff = (tenantId: string, over: Record<string, unknown> = {}) =>
  db.staffRecord.create({ data: { tenantId, category: "TEACHING", firstName: "Ola", lastName: "Bello", ...over } });
const event = (tenantId: string, over: Record<string, unknown> = {}) => ({
  tenantId,
  subject: "STUDENT" as const,
  action: "SUSPENDED" as const,
  reason: "A fair reason",
  startsOn: new Date("2026-11-08"),
  decidedByUserId: admin.id,
  ...over,
});

test.describe("a standing that makes no sense is refused by the database", () => {
  test("a pupil is never terminated, a member of staff is never expelled, and only a suspension has an end date", async () => {
    await expect(student(a.id, { standing: "TERMINATED" })).rejects.toThrow();
    await expect(student(a.id, { standing: "EXPELLED", standingUntil: new Date("2027-01-01") })).rejects.toThrow();
    await expect(student(a.id, { standing: "ACTIVE", standingUntil: new Date("2027-01-01") })).rejects.toThrow();
    await expect(staff(a.id, { standing: "EXPELLED" })).rejects.toThrow();
    await expect(staff(a.id, { standing: "TERMINATED", standingUntil: new Date("2027-01-01") })).rejects.toThrow();
    const ok = await student(a.id, { standing: "SUSPENDED", standingUntil: new Date("2027-01-01") });
    expect(ok.standing).toBe("SUSPENDED");
    expect((await student(a.id, { standing: "EXPELLED" })).standing).toBe("EXPELLED");
    expect((await staff(a.id, { standing: "TERMINATED" })).standing).toBe("TERMINATED");
  });

  test("a membership holds the same rule", async () => {
    const user = await createUser();
    const member = await addMembership(user.id, a.id, Role.TEACHING_STAFF);
    const id = (member as { id: string }).id;
    await expect(db.tenantMembership.update({ where: { id }, data: { standing: "EXPELLED" } })).rejects.toThrow();
    await expect(
      db.tenantMembership.update({ where: { id }, data: { standing: "ACTIVE", standingUntil: new Date("2027-01-01") } }),
    ).rejects.toThrow();
    await db.tenantMembership.update({ where: { id }, data: { standing: "SUSPENDED", standingUntil: new Date("2027-01-01") } });
  });

  test("a history row needs a reason of 3 to 500 characters, a subject that matches its ids, and an action that fits its subject", async () => {
    const pupil = await student(a.id);
    const teacher = await staff(a.id);
    const good = event(a.id, { studentId: pupil.id });
    await db.standingEvent.create({ data: good });
    await expect(db.standingEvent.create({ data: { ...good, reason: "ab" } })).rejects.toThrow();
    await expect(db.standingEvent.create({ data: { ...good, reason: "x".repeat(501) } })).rejects.toThrow();
    await expect(db.standingEvent.create({ data: event(a.id, {}) })).rejects.toThrow(); // a pupil event with no pupil
    await expect(db.standingEvent.create({ data: { ...good, staffRecordId: teacher.id } })).rejects.toThrow(); // both ids
    await expect(db.standingEvent.create({ data: event(a.id, { subject: "STAFF", studentId: pupil.id }) })).rejects.toThrow();
    await expect(db.standingEvent.create({ data: { ...good, action: "TERMINATED" } })).rejects.toThrow(); // a pupil is not terminated
    await expect(
      db.standingEvent.create({ data: event(a.id, { subject: "STAFF", staffRecordId: teacher.id, action: "EXPELLED" }) }),
    ).rejects.toThrow();
    await db.standingEvent.create({ data: event(a.id, { subject: "STAFF", staffRecordId: teacher.id, action: "TERMINATED" }) });
  });

  test("a history row cannot name a record of another school", async () => {
    const foreign = await student(b.id);
    await expect(db.standingEvent.create({ data: event(a.id, { studentId: foreign.id }) })).rejects.toThrow();
  });
});

test.describe("the history is append-only and the school's own", () => {
  test("the runtime role can write and read a row, but cannot change or remove it", async () => {
    const pupil = await student(a.id);
    const row = await asSchool(a).transaction((tx) => tx.standingEvent.create({ data: event(a.id, { studentId: pupil.id }) }));
    expect((await asSchool(a).transaction((tx) => tx.standingEvent.findMany({ where: { studentId: pupil.id } }))).map((r) => r.id)).toEqual(
      [row.id],
    );
    await expect(
      asSchool(a).transaction((tx) => tx.standingEvent.updateMany({ where: { id: row.id }, data: { reason: "Tampered with" } })),
    ).rejects.toThrow(/permission denied|row-level security/i);
    await expect(asSchool(a).transaction((tx) => tx.standingEvent.deleteMany({ where: { id: row.id } }))).rejects.toThrow(
      /permission denied|row-level security/i,
    );
    expect((await db.standingEvent.findUniqueOrThrow({ where: { id: row.id } })).reason).toBe("A fair reason");
  });

  test("another school sees none of it and writes none of it", async () => {
    const pupil = await student(a.id);
    await asSchool(a).transaction((tx) => tx.standingEvent.create({ data: event(a.id, { studentId: pupil.id }) }));
    expect(await asSchool(b).transaction((tx) => tx.standingEvent.findMany({ where: { studentId: pupil.id } }))).toEqual([]);
    await expect(asSchool(b).transaction((tx) => tx.standingEvent.create({ data: event(a.id, { studentId: pupil.id }) }))).rejects.toThrow(
      /row-level security|violates/i,
    );
  });
});

test.describe("the generic settings table", () => {
  const make = (tenantId: string, data: Record<string, unknown> = {}) =>
    db.tenantSetting.create({
      data: { tenantId, campusId: null, key: "standing.campusAdminMaySuspend", value: true, updatedById: admin.id, ...data },
    });

  test("a key that is not a name, an oversized key and a huge value are refused", async () => {
    await expect(make(a.id, { key: "Not A Key" })).rejects.toThrow();
    await expect(make(a.id, { key: "nodots" })).rejects.toThrow();
    await expect(make(a.id, { key: `a.${"x".repeat(80)}` })).rejects.toThrow();
    await expect(make(a.id, { value: { text: "x".repeat(5000) } })).rejects.toThrow();
  });

  test("one value per school, campus and key: the school's own value is unique even though its campus is null", async () => {
    await db.tenantSetting.deleteMany({ where: { tenantId: a.id } });
    await make(a.id);
    await expect(make(a.id)).rejects.toThrow();
    await make(a.id, { campusId: a.campuses[0].id });
    await expect(make(a.id, { campusId: a.campuses[0].id })).rejects.toThrow();
    await make(a.id, { key: "programs.enabled" });
  });

  test("a campus of another school is refused, and the school's own rows are invisible to another school", async () => {
    await expect(make(b.id, { campusId: a.campuses[0].id })).rejects.toThrow();
    expect(await asSchool(b).transaction((tx) => tx.tenantSetting.findMany())).toEqual([]);
    expect((await asSchool(a).transaction((tx) => tx.tenantSetting.findMany())).length).toBeGreaterThan(0);
  });
});

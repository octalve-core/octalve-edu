import "../support/env";
import { Role } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { forTenant, forUser } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";

// The platform's coarse counters at the DATABASE level (task 0010 F1, ADR 0016 amendment): one `TenantStats` row per school, kept by triggers,
// readable only through `platform_school_stats()`. Four promises: every kind of write moves the right counter; the triggers and a live recount
// always agree (and `tenant_stats_recompute` repairs a drifted row); the runtime role can neither read nor write the table; and the platform
// function refuses anyone who is not a platform administrator and returns counts only - no name, no id of a person.

let school: TestTenant;
let platformAdmin: { id: string };
let ordinary: { id: string };

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Counter School", campuses: ["North"] });
  platformAdmin = await createUser({ platformAdmin: true });
  ordinary = await createUser({ role: Role.ADMIN });
});
test.afterAll(async () => {
  await db.platformAuditLog.deleteMany({ where: { actorUserId: { in: [platformAdmin.id, ordinary.id] } } });
  await removeCreatedTenants();
});

type Counters = { activeMembers: number; activeAdmins: number; students: number; campuses: number };
const stored = async (tenantId: string): Promise<Counters> => {
  const rows = await db.$queryRaw<{ activeMembers: number; activeAdmins: number; students: number; campuses: number }[]>`
    SELECT "activeMembers", "activeAdmins", "students", "campuses" FROM "TenantStats" WHERE "tenantId" = ${tenantId}`;
  return rows[0] ?? { activeMembers: 0, activeAdmins: 0, students: 0, campuses: 0 };
};
/// The truth, counted from the tables themselves.
const live = async (tenantId: string): Promise<Counters> => ({
  activeMembers: await db.tenantMembership.count({ where: { tenantId, deactivatedAt: null } }),
  activeAdmins: await db.tenantMembership.count({ where: { tenantId, deactivatedAt: null, role: Role.ADMIN } }),
  students: await db.studentRecord.count({ where: { tenantId, archivedAt: null } }),
  campuses: await db.campus.count({ where: { tenantId } }),
});
const student = (tenantId: string, n: string) =>
  db.studentRecord.create({
    data: {
      tenantId,
      firstName: `Pupil${n}`,
      lastName: "Count",
      dateOfBirth: new Date("2012-01-01"),
      admissionNo: `CNT/${n}/${Math.random()}`,
    },
  });

test.describe("the triggers", () => {
  test("a school with nothing in it has no members, administrators or students - and its campus is counted", async () => {
    expect(await stored(school.id)).toEqual({ activeMembers: 0, activeAdmins: 0, students: 0, campuses: 1 });
  });

  test("memberships: adding counts; an ADMIN counts as an administrator; deactivating, reactivating, changing the role and deleting all follow", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const before = await stored(school.id);
    await addMembership(a.id, school.id, Role.ADMIN);
    await addMembership(b.id, school.id, Role.TEACHING_STAFF);
    await addMembership(c.id, school.id, Role.PARENT);
    expect(await stored(school.id)).toEqual({ ...before, activeMembers: before.activeMembers + 3, activeAdmins: before.activeAdmins + 1 });

    const key = (userId: string) => ({ userId_tenantId: { userId, tenantId: school.id } });
    await db.tenantMembership.update({ where: key(a.id), data: { deactivatedAt: new Date() } });
    expect(await stored(school.id)).toEqual({ ...before, activeMembers: before.activeMembers + 2, activeAdmins: before.activeAdmins });
    await db.tenantMembership.update({ where: key(a.id), data: { deactivatedAt: null } });
    expect((await stored(school.id)).activeAdmins).toBe(before.activeAdmins + 1);

    await db.tenantMembership.update({ where: key(b.id), data: { role: Role.ADMIN } }); // promoted
    expect((await stored(school.id)).activeAdmins).toBe(before.activeAdmins + 2);
    await db.tenantMembership.update({ where: key(a.id), data: { role: Role.TEACHING_STAFF } }); // demoted
    expect((await stored(school.id)).activeAdmins).toBe(before.activeAdmins + 1);

    await db.tenantMembership.delete({ where: key(c.id) });
    expect((await stored(school.id)).activeMembers).toBe(before.activeMembers + 2);
    expect(await stored(school.id)).toEqual(await live(school.id));
  });

  test("a deactivated administrator is not an administrator; deleting a deactivated membership changes nothing", async () => {
    const person = await createUser();
    await addMembership(person.id, school.id, Role.ADMIN);
    const key = { userId_tenantId: { userId: person.id, tenantId: school.id } };
    await db.tenantMembership.update({ where: key, data: { deactivatedAt: new Date() } });
    const before = await stored(school.id);
    await db.tenantMembership.delete({ where: key });
    expect(await stored(school.id)).toEqual(before);
    expect(await stored(school.id)).toEqual(await live(school.id));
  });

  test("students: creating counts, archiving and restoring follow, deleting a live one drops it, deleting an archived one changes nothing", async () => {
    const before = await stored(school.id);
    const one = await student(school.id, "1");
    const two = await student(school.id, "2");
    expect((await stored(school.id)).students).toBe(before.students + 2);
    await db.studentRecord.update({ where: { id: one.id }, data: { archivedAt: new Date() } });
    expect((await stored(school.id)).students).toBe(before.students + 1);
    await db.studentRecord.update({ where: { id: one.id }, data: { archivedAt: null } });
    expect((await stored(school.id)).students).toBe(before.students + 2);
    await db.studentRecord.update({ where: { id: two.id }, data: { archivedAt: new Date() } });
    await db.studentRecord.delete({ where: { id: two.id } }); // archived: already out of the count
    expect((await stored(school.id)).students).toBe(before.students + 1);
    await db.studentRecord.delete({ where: { id: one.id } });
    expect(await stored(school.id)).toEqual(before);
  });

  test("campuses: creating and deleting follow", async () => {
    const before = await stored(school.id);
    const extra = await db.campus.create({ data: { tenantId: school.id, name: "East" } });
    expect((await stored(school.id)).campuses).toBe(before.campuses + 1);
    await db.campus.delete({ where: { id: extra.id } });
    expect(await stored(school.id)).toEqual(before);
  });

  test("one school's writes never move another school's counters", async () => {
    const other = await createTenant({ name: "Other Counter School", campuses: ["A", "B"] });
    const mine = await stored(school.id);
    await addMembership((await createUser()).id, other.id, Role.TEACHING_STAFF);
    await student(other.id, "x");
    expect(await stored(school.id)).toEqual(mine);
    expect(await stored(other.id)).toEqual({ activeMembers: 1, activeAdmins: 0, students: 1, campuses: 2 });
  });

  test("deleting a school (its people and campuses go with it) leaves no counter row and raises no error", async () => {
    const doomed = await createTenant({ name: "Doomed Counter School", campuses: ["Only"] });
    await addMembership((await createUser()).id, doomed.id, Role.ADMIN);
    await student(doomed.id, "d");
    expect((await stored(doomed.id)).activeMembers).toBe(1);
    await db.tenant.delete({ where: { id: doomed.id } });
    expect(await db.$queryRaw`SELECT 1 FROM "TenantStats" WHERE "tenantId" = ${doomed.id}`).toEqual([]);
  });
});

test.describe("the recount", () => {
  test("after a mixed run the stored counters equal a live recount - for every school in the database", async () => {
    const schools = await db.tenant.findMany({ select: { id: true } });
    for (const { id } of schools) expect(await stored(id), `school ${id}`).toEqual(await live(id));
  });

  test("tenant_stats_recompute() repairs a drifted row and leaves a correct one alone", async () => {
    await db.$executeRaw`INSERT INTO "TenantStats" ("tenantId") VALUES (${school.id}) ON CONFLICT DO NOTHING`;
    await db.$executeRaw`UPDATE "TenantStats" SET "students" = 999, "activeMembers" = 999, "activeAdmins" = 999, "campuses" = 999 WHERE "tenantId" = ${school.id}`;
    await db.$executeRaw`SELECT tenant_stats_recompute(${school.id})`;
    expect(await stored(school.id)).toEqual(await live(school.id));
    const again = await stored(school.id);
    await db.$executeRaw`SELECT tenant_stats_recompute(${school.id})`;
    expect(await stored(school.id)).toEqual(again);
  });

  test("the migration's backfill (every school recounted once) rebuilds every row from nothing", async () => {
    await db.$executeRaw`DELETE FROM "TenantStats"`;
    await db.$executeRawUnsafe(
      `DO $$ DECLARE t record; BEGIN FOR t IN SELECT id FROM "Tenant" LOOP PERFORM tenant_stats_recompute(t.id); END LOOP; END $$`,
    );
    for (const { id } of await db.tenant.findMany({ select: { id: true } }))
      expect(await stored(id), `school ${id}`).toEqual(await live(id));
  });

  test("recomputing a school that does not exist is a no-op, not an error", async () => {
    await expect(db.$executeRaw`SELECT tenant_stats_recompute(${"no-such-school"})`).resolves.toBeDefined();
    expect(await db.$queryRaw`SELECT 1 FROM "TenantStats" WHERE "tenantId" = 'no-such-school'`).toEqual([]);
  });
});

test.describe("who can see the counters", () => {
  test("the runtime role reads no row and writes no row of the table - not even its own school's", async () => {
    const asSchool = forTenant(trustedTenantId(school.id));
    const rows = await asSchool.transaction((tx) => tx.$queryRaw<unknown[]>`SELECT * FROM "TenantStats"`);
    expect(rows).toEqual([]);
    await expect(
      asSchool.transaction((tx) => tx.$executeRaw`UPDATE "TenantStats" SET "students" = 5 WHERE "tenantId" = ${school.id}`),
    ).resolves.toBe(0);
    await expect(
      asSchool.transaction((tx) => tx.$executeRaw`INSERT INTO "TenantStats" ("tenantId", "students") VALUES (${school.id}, 5)`),
    ).rejects.toThrow(/row-level security|policy|permission/i);
    expect((await stored(school.id)).students).not.toBe(5);
  });

  test("the runtime role cannot call the repair or the delta function (it could otherwise rewrite a school's counters)", async () => {
    const rows = await db.$queryRaw<{ fn: string; allowed: boolean }[]>`
      SELECT 'recompute' AS fn, has_function_privilege('app_user', 'tenant_stats_recompute(text)', 'EXECUTE') AS allowed
      UNION ALL SELECT 'apply', has_function_privilege('app_user', 'tenant_stats_apply(text,int,int,int,int)', 'EXECUTE')`;
    expect(rows).toEqual([
      { fn: "recompute", allowed: false },
      { fn: "apply", allowed: false },
    ]);
  });

  test("platform_school_stats(): refused to a school administrator and to an unknown user", async () => {
    for (const who of [ordinary.id, "no-such-user"]) {
      await expect(
        forUser(who).transaction((tx) => tx.$queryRaw`SELECT * FROM platform_school_stats()`),
        who,
      ).rejects.toThrow(/platform_admin_required/);
    }
  });

  test("platform_school_stats(): a platform administrator gets one row per school with the counters - and NOTHING else", async () => {
    const rows = await forUser(platformAdmin.id).transaction(
      (tx) => tx.$queryRaw<Record<string, unknown>[]>`SELECT * FROM platform_school_stats()`,
    );
    expect(Object.keys(rows[0]).sort()).toEqual(["active_admins", "active_members", "campuses", "students", "tenant_id"]);
    const mine = rows.find((r) => r.tenant_id === school.id);
    expect(mine).toBeDefined();
    const truth = await live(school.id);
    expect([mine!.active_members, mine!.active_admins, mine!.students, mine!.campuses].map(Number)).toEqual([
      truth.activeMembers,
      truth.activeAdmins,
      truth.students,
      truth.campuses,
    ]);
    const everySchool = await db.tenant.count();
    expect(rows).toHaveLength(everySchool);
  });

  test("a school that has no counter row yet shows zeros, not a missing line", async () => {
    const blank = await createTenant({ name: "Blank Counter School", campuses: [] });
    await db.$executeRaw`DELETE FROM "TenantStats" WHERE "tenantId" = ${blank.id}`;
    const rows = await forUser(platformAdmin.id).transaction(
      (tx) => tx.$queryRaw<Record<string, unknown>[]>`SELECT * FROM platform_school_stats()`,
    );
    const row = rows.find((r) => r.tenant_id === blank.id);
    expect([row?.active_members, row?.active_admins, row?.students, row?.campuses].map(Number)).toEqual([0, 0, 0, 0]);
  });
});

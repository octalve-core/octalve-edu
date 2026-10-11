import "../support/env";
import { Prisma, Role } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { prisma } from "@/lib/db";
import { forTenant, forUser } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";

// Campus administrators and the platform surface at the DATABASE level (plan C2, C5, C7, C8; ADR 0016), run as `app_user` — the role the
// app runs as — with fixtures arranged through the admin client `db`. Three promises: the CHECK keeps a campus administrator tied to a
// campus; the `platform_*` functions refuse anyone who is not a platform administrator and audit what they do; and a platform
// administrator STILL reads no school's data (no RLS bypass).

let school: TestTenant;
let platformAdmin: { id: string };
let ordinary: { id: string };
const made: string[] = []; // codes of schools made through platform_create_school

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Platform Test School", campuses: ["North", "South"] });
  platformAdmin = await createUser({ platformAdmin: true });
  ordinary = await createUser({ role: Role.ADMIN }); // a school ADMIN is not a platform administrator
});
test.afterAll(async () => {
  await db.tenant.deleteMany({ where: { code: { in: made } } });
  await db.platformAuditLog.deleteMany({ where: { actorUserId: { in: [platformAdmin.id, ordinary.id] } } });
  await removeCreatedTenants();
});

const code = () => `plat-${Math.random().toString(36).slice(2, 8)}`;
const asPlatform = <T>(userId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) => forUser(userId).transaction(fn);
const create = (tx: Prisma.TransactionClient, c: string, name = "New School", type = "K12") =>
  tx.$queryRaw<{ platform_create_school: string }[]>`SELECT platform_create_school(${c}, ${name}, ${type}::"SchoolType")`;

test.describe("a campus administrator always has a campus", () => {
  test("the CHECK refuses CAMPUS_ADMIN without a campus and accepts it with one; ADMIN needs none", async () => {
    const person = await createUser();
    await expect(
      db.tenantMembership.create({ data: { userId: person.id, tenantId: school.id, role: Role.CAMPUS_ADMIN, campusId: null } }),
    ).rejects.toThrow(/campus_admin_has_campus|check constraint/i);
    const m = await db.tenantMembership.create({
      data: { userId: person.id, tenantId: school.id, role: Role.CAMPUS_ADMIN, campusId: school.campuses[0].id },
    });
    expect(m.role).toBe("CAMPUS_ADMIN");
    const other = await createUser();
    await expect(addMembership(other.id, school.id, Role.ADMIN, null)).resolves.toMatchObject({ role: "ADMIN", campusId: null });
  });

  test("changing an existing membership into a campus administrator without a campus is refused too", async () => {
    const person = await createUser();
    const m = await addMembership(person.id, school.id, Role.TEACHING_STAFF, null);
    await expect(db.tenantMembership.update({ where: { id: m.id }, data: { role: Role.CAMPUS_ADMIN } })).rejects.toThrow(
      /campus_admin_has_campus|check constraint/i,
    );
  });

  test("a campus administrator cannot hold extra permissions (the 1.0 CHECK covers the new role)", async () => {
    const person = await createUser();
    await expect(
      db.tenantMembership.create({
        data: {
          userId: person.id,
          tenantId: school.id,
          role: Role.CAMPUS_ADMIN,
          campusId: school.campuses[0].id,
          permissions: ["CAN_MANAGE_FINANCE"],
        },
      }),
    ).rejects.toThrow(/check constraint|permissions/i);
  });
});

test.describe("the platform functions refuse anyone who is not a platform administrator", () => {
  const refused = /platform_admin_required/;

  test("a school ADMIN, a person with no context and a missing user are all refused, on every function", async () => {
    const calls: [string, (tx: Prisma.TransactionClient) => Promise<unknown>][] = [
      ["list", (tx) => tx.$queryRaw`SELECT * FROM platform_list_schools()`],
      ["create", (tx) => create(tx, code())],
      ["type", (tx) => tx.$queryRaw`SELECT platform_set_school_type(${school.id}, 'HIGHER_ED'::"SchoolType")`],
      ["suspend", (tx) => tx.$queryRaw`SELECT platform_set_school_suspended(${school.id}, true, 'because')`],
      ["audit", (tx) => tx.$queryRaw`SELECT * FROM platform_list_audit(10)`],
    ];
    for (const [name, call] of calls) {
      await expect(asPlatform(ordinary.id, call), `${name} as a school admin`).rejects.toThrow(refused);
      await expect(asPlatform("no-such-user", call), `${name} as a missing user`).rejects.toThrow(refused);
      await expect(
        prisma.$transaction((tx) => call(tx)),
        `${name} with no user context`,
      ).rejects.toThrow(refused);
    }
    expect(await db.tenant.findUnique({ where: { id: school.id } })).toMatchObject({ suspendedAt: null, schoolType: "K12" });
  });
});

test.describe("what a platform administrator can do", () => {
  test("creates a school: the row, its settings row (made by the trigger), an audit row, and the caller's school context is put back", async () => {
    const c = code();
    made.push(c);
    const result = await asPlatform(platformAdmin.id, async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', 'caller-context', true)`;
      const [row] = await create(tx, c, "  Created Through Platform  ", "HIGHER_ED");
      const [{ now }] = await tx.$queryRaw<{ now: string }[]>`SELECT current_setting('app.tenant_id', true) AS now`;
      return { id: row.platform_create_school, contextAfter: now };
    });
    expect(result.contextAfter).toBe("caller-context");
    const tenant = await db.tenant.findUniqueOrThrow({ where: { code: c } });
    expect(tenant).toMatchObject({ id: result.id, name: "Created Through Platform", schoolType: "HIGHER_ED", suspendedAt: null });
    expect(await db.schoolSettings.count({ where: { tenantId: tenant.id } })).toBe(1);
    const audit = await db.platformAuditLog.findFirstOrThrow({ where: { targetTenantId: tenant.id, action: "SCHOOL_CREATED" } });
    expect(audit).toMatchObject({ actorUserId: platformAdmin.id, afterValue: { code: c, schoolType: "HIGHER_ED" } });
  });

  test("a duplicate code is a clean unique-violation, a blank name is refused, and neither leaves a trace", async () => {
    const c = code();
    made.push(c);
    await asPlatform(platformAdmin.id, (tx) => create(tx, c));
    const before = await db.platformAuditLog.count({ where: { actorUserId: platformAdmin.id } });
    await expect(asPlatform(platformAdmin.id, (tx) => create(tx, c))).rejects.toThrow(/already exists|23505/i);
    await expect(asPlatform(platformAdmin.id, (tx) => create(tx, code(), "   "))).rejects.toThrow(/platform_invalid_input/);
    expect(await db.platformAuditLog.count({ where: { actorUserId: platformAdmin.id } })).toBe(before);
  });

  test("lists schools as identity data only — columns, no people, no counts", async () => {
    const rows = await asPlatform(platformAdmin.id, (tx) => tx.$queryRaw<Record<string, unknown>[]>`SELECT * FROM platform_list_schools()`);
    expect(rows.map((r) => r.code)).toContain(school.code);
    expect(Object.keys(rows[0]).sort()).toEqual(["code", "created_at", "id", "name", "school_type", "suspended_at"]);
  });

  test("changes a school's type when it has no periods, refuses once it has one, and audits only the change", async () => {
    const target = await createTenant({ name: "Type Change School" });
    const set = (type: string) =>
      asPlatform(
        platformAdmin.id,
        (tx) => tx.$queryRaw<{ platform_set_school_type: boolean }[]>`SELECT platform_set_school_type(${target.id}, ${type}::"SchoolType")`,
      );
    expect((await set("VOCATIONAL"))[0].platform_set_school_type).toBe(true);
    expect((await db.tenant.findUniqueOrThrow({ where: { id: target.id } })).schoolType).toBe("VOCATIONAL");
    expect((await set("VOCATIONAL"))[0].platform_set_school_type).toBe(true); // no change: no second audit row
    expect(await db.platformAuditLog.count({ where: { targetTenantId: target.id, action: "SCHOOL_TYPE_CHANGED" } })).toBe(1);

    const session = await db.academicSession.create({
      data: { tenantId: target.id, label: "2026", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-01"), status: "ACTIVE" },
    });
    await db.academicPeriod.create({
      data: {
        tenantId: target.id,
        sessionId: session.id,
        kind: "COHORT",
        ordinal: 1,
        label: "Cohort 1",
        startDate: new Date("2026-09-01"),
      },
    });
    await expect(set("K12")).rejects.toThrow(/platform_school_has_periods/);
    expect((await db.tenant.findUniqueOrThrow({ where: { id: target.id } })).schoolType).toBe("VOCATIONAL");
    expect(
      (
        await asPlatform(
          platformAdmin.id,
          (tx) =>
            tx.$queryRaw<{ platform_set_school_type: boolean }[]>`SELECT platform_set_school_type('no-such-school', 'K12'::"SchoolType")`,
        )
      )[0].platform_set_school_type,
    ).toBe(false);
  });

  test("suspends (a reason is required) and reinstates; each is audited once and doing it twice changes nothing", async () => {
    const target = await createTenant({ name: "Suspend Me" });
    const set = (on: boolean, reason: string | null) =>
      asPlatform(platformAdmin.id, (tx) => tx.$queryRaw`SELECT platform_set_school_suspended(${target.id}, ${on}, ${reason})`);
    await expect(set(true, null)).rejects.toThrow(/platform_reason_required/);
    await expect(set(true, "   ")).rejects.toThrow(/platform_reason_required/);
    expect((await db.tenant.findUniqueOrThrow({ where: { id: target.id } })).suspendedAt).toBeNull();

    await set(true, "Unpaid invoice");
    await set(true, "Unpaid invoice");
    const suspended = await db.tenant.findUniqueOrThrow({ where: { id: target.id } });
    expect(suspended.suspendedAt).not.toBeNull();
    expect(await db.platformAuditLog.count({ where: { targetTenantId: target.id, action: "SCHOOL_SUSPENDED" } })).toBe(1);
    expect(await db.platformAuditLog.findFirstOrThrow({ where: { targetTenantId: target.id, action: "SCHOOL_SUSPENDED" } })).toMatchObject({
      reason: "Unpaid invoice",
      actorUserId: platformAdmin.id,
    });

    await set(false, null);
    expect((await db.tenant.findUniqueOrThrow({ where: { id: target.id } })).suspendedAt).toBeNull();
    expect(await db.platformAuditLog.count({ where: { targetTenantId: target.id, action: "SCHOOL_REINSTATED" } })).toBe(1);
  });

  test("reads its own history through platform_list_audit, newest first, capped", async () => {
    const rows = await asPlatform(platformAdmin.id, (tx) => tx.$queryRaw<{ action: string }[]>`SELECT * FROM platform_list_audit(500)`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(200);
  });
});

test.describe("a platform administrator still reads no school's data", () => {
  test("with the platform user's context they see no membership, no campus, no student, no audit row of any school", async () => {
    await db.auditLog.create({
      data: { tenantId: school.id, actorUserId: platformAdmin.id, action: "ARRANGED", targetType: "User", targetId: platformAdmin.id },
    });
    await addMembership(platformAdmin.id, school.id, Role.PARENT); // even a school they happen to belong to shows only through the USER path
    const seen = await asPlatform(platformAdmin.id, async (tx) => ({
      campuses: await tx.campus.count(),
      students: await tx.studentRecord.count(),
      audit: await tx.auditLog.count(),
      settings: await tx.schoolSettings.count(),
      invoices: await tx.invoice.count(),
      results: await tx.result.count(),
      memberships: await tx.tenantMembership.findMany({ select: { tenantId: true } }), // the user path: their own rows only
    }));
    expect(seen).toMatchObject({ campuses: 0, students: 0, audit: 0, settings: 0, invoices: 0, results: 0 });
    expect(seen.memberships.every((m) => m.tenantId === school.id)).toBe(true);
    // and with a school's context set the platform flag adds nothing: that is the school's own RLS, unchanged
    const inSchool = await forTenant(trustedTenantId(school.id)).transaction((tx) => tx.campus.count());
    expect(inSchool).toBe(2);
  });

  test("the runtime role cannot read or write PlatformAuditLog directly, whoever is signed in", async () => {
    await db.platformAuditLog.create({ data: { actorUserId: platformAdmin.id, action: "ARRANGED" } });
    expect(await asPlatform(platformAdmin.id, (tx) => tx.platformAuditLog.count())).toBe(0);
    await expect(
      asPlatform(platformAdmin.id, (tx) => tx.platformAuditLog.create({ data: { actorUserId: platformAdmin.id, action: "FORGED" } })),
    ).rejects.toThrow(/row-level security|violates|permission denied/i);
    expect(await db.platformAuditLog.count({ where: { action: "FORGED" } })).toBe(0);
  });
});

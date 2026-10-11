import "../support/env";
import { Role } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { forTenant, forUser } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";

// platform_authorize_first_admin_invite() at the DATABASE level (task 0010 F2, ADR 0016 amendment): the one door by which a platform administrator
// may cause an invitation to be written into a school - and only when the school has no active ADMIN, checked LIVE inside the school (not from the
// counters). It writes the platform audit row; the application writes the invitation in the same transaction.

let school: TestTenant;
let platformAdmin: { id: string };
let ordinary: { id: string };

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "First Admin School", campuses: ["Only"] });
  platformAdmin = await createUser({ platformAdmin: true });
  ordinary = await createUser({ role: Role.ADMIN });
});
test.afterAll(async () => {
  await db.platformAuditLog.deleteMany({ where: { actorUserId: { in: [platformAdmin.id, ordinary.id] } } });
  await removeCreatedTenants();
});

const authorize = (userId: string, tenantId: string, email = "first@example.test") =>
  forUser(userId).transaction(
    (tx) => tx.$queryRaw<{ platform_authorize_first_admin_invite: boolean }[]>`
    SELECT platform_authorize_first_admin_invite(${tenantId}, ${email})`,
  );
const logged = (tenantId: string) => db.platformAuditLog.findMany({ where: { targetTenantId: tenantId, action: "FIRST_ADMIN_REINVITED" } });

test.describe("platform_authorize_first_admin_invite", () => {
  test("refused to a school administrator and to an unknown user", async () => {
    for (const who of [ordinary.id, "no-such-user"]) {
      await expect(authorize(who, school.id), who).rejects.toThrow(/platform_admin_required/);
    }
    expect(await logged(school.id)).toEqual([]);
  });

  test("a school with no active ADMIN: true, and one audit row naming the actor and the address", async () => {
    const rows = await authorize(platformAdmin.id, school.id, "chosen@example.test");
    expect(rows[0].platform_authorize_first_admin_invite).toBe(true);
    const log = await logged(school.id);
    expect(log).toHaveLength(1);
    expect([log[0].actorUserId, log[0].afterValue]).toEqual([platformAdmin.id, { email: "chosen@example.test" }]);
  });

  test("an unknown school is false, not an error, and writes nothing", async () => {
    const rows = await authorize(platformAdmin.id, "no-such-school");
    expect(rows[0].platform_authorize_first_admin_invite).toBe(false);
    expect(await logged("no-such-school")).toEqual([]);
  });

  test("a school with an active ADMIN is refused (platform_school_has_admin) and nothing is logged; a deactivated one, a campus administrator and a teacher do not count", async () => {
    const other = await createTenant({ name: "Has Admin School", campuses: ["A"] });
    const boss = await createUser();
    await addMembership(boss.id, other.id, Role.ADMIN);
    await expect(authorize(platformAdmin.id, other.id)).rejects.toThrow(/platform_school_has_admin/);
    expect(await logged(other.id)).toEqual([]);

    await addMembership((await createUser()).id, other.id, Role.CAMPUS_ADMIN, other.campuses[0].id);
    await addMembership((await createUser()).id, other.id, Role.TEACHING_STAFF);
    await expect(authorize(platformAdmin.id, other.id)).rejects.toThrow(/platform_school_has_admin/); // still the one ADMIN

    await db.tenantMembership.update({
      where: { userId_tenantId: { userId: boss.id, tenantId: other.id } },
      data: { deactivatedAt: new Date() },
    });
    expect((await authorize(platformAdmin.id, other.id))[0].platform_authorize_first_admin_invite).toBe(true);
  });

  test("an empty address is refused", async () => {
    await expect(authorize(platformAdmin.id, school.id, "   ")).rejects.toThrow(/platform_invalid_input/);
  });

  test("it leaves the caller's own school context as it found it (it looks inside one school for one statement only)", async () => {
    const result = await forTenant(trustedTenantId(school.id)).transaction(async (tx) => {
      const before = await tx.$queryRaw<{ v: string }[]>`SELECT current_setting('app.tenant_id', true) AS v`;
      await tx.$queryRaw`SELECT set_config('app.user_id', ${platformAdmin.id}, true)`;
      await tx.$queryRaw`SELECT platform_authorize_first_admin_invite(${school.id}, 'ctx@example.test')`;
      const after = await tx.$queryRaw<{ v: string }[]>`SELECT current_setting('app.tenant_id', true) AS v`;
      return [before[0].v, after[0].v];
    });
    expect(result[1]).toBe(result[0]);
  });

  test("the platform administrator still reads no school's rows - the function returns a boolean, nothing else", async () => {
    const rows = await authorize(platformAdmin.id, school.id);
    expect(Object.keys(rows[0])).toEqual(["platform_authorize_first_admin_invite"]);
    const seen = await forUser(platformAdmin.id).transaction((tx) => tx.$queryRaw<unknown[]>`SELECT * FROM "TenantMembership"`);
    expect(seen).toEqual([]);
  });
});

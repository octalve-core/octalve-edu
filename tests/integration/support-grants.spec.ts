import "../support/env";
import { Role } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { forTenant, forUser } from "@/lib/tenant/for-tenant";
import { SUPPORT_AREAS } from "@/lib/support/areas";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";

// SupportGrant at the DATABASE level (task 0011 slice A, ADR 0017): a grant is a row in the school's own data (row-level security, as app_user), limited
// by CHECKs to the grantable areas and 24 hours, append-and-revoke only (a trigger), and visible to the platform only through platform_support_grants().

let school: TestTenant;
let other: TestTenant;
let platformAdmin: { id: string };
let ordinary: { id: string };
let adminId: string;

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Grant School" });
  other = await createTenant({ name: "Other Grant School" });
  platformAdmin = await createUser({ platformAdmin: true });
  ordinary = await createUser();
  adminId = (await createUser()).id;
  await addMembership(adminId, school.id, Role.ADMIN);
});
test.afterAll(async () => {
  await db.platformAuditLog.deleteMany({ where: { actorUserId: platformAdmin.id } });
  await removeCreatedTenants();
});

const asSchool = (t: TestTenant) => forTenant(trustedTenantId(t.id));
const hours = (n: number) => new Date(Date.now() + n * 3600_000);
const grant = (t: TestTenant, over: { areas?: string[]; expiresAt?: Date; reason?: string } = {}) =>
  asSchool(t).transaction((tx) =>
    tx.supportGrant.create({
      data: {
        tenantId: t.id,
        areas: over.areas ?? ["people"],
        reason: over.reason ?? "ticket 1",
        expiresAt: over.expiresAt ?? hours(4),
        createdById: adminId,
      },
    }),
  );

test.describe("the table", () => {
  test("a school creates a grant of its own; another school's context cannot, and cannot see it", async () => {
    const mine = await grant(school);
    await expect(
      asSchool(other).transaction((tx) =>
        tx.supportGrant.create({ data: { tenantId: school.id, areas: ["people"], reason: "x", expiresAt: hours(1) } }),
      ),
    ).rejects.toThrow(/row-level security|policy/i);
    expect(await asSchool(other).transaction((tx) => tx.supportGrant.findMany())).toEqual([]);
    expect((await asSchool(school).transaction((tx) => tx.supportGrant.findMany())).map((g) => g.id)).toContain(mine.id);
  });

  test("the CHECKs: no areas, finance, an unknown area, more than 24 hours, an expiry in the past are all refused", async () => {
    for (const bad of [
      { areas: [] },
      { areas: ["finance"] },
      { areas: ["people", "nonsense"] },
      { expiresAt: hours(25) },
      { expiresAt: hours(-1) },
    ]) {
      await expect(grant(school, bad), JSON.stringify(bad)).rejects.toThrow(/check constraint|violates/i);
    }
    await expect(
      grant(school, { areas: ["settings", "academics", "people", "attendance", "results"], expiresAt: hours(24) }),
    ).resolves.toBeDefined();
  });

  test("the only change a grant allows is REVOKING it: nothing else may be edited, a revocation cannot be undone, and no grant is ever deleted", async () => {
    const g = await grant(school);
    const edit = (data: object) => asSchool(school).transaction((tx) => tx.supportGrant.update({ where: { id: g.id }, data }));
    await expect(edit({ areas: ["people", "settings"] })).rejects.toThrow(/support_grant_immutable|only be revoked/i);
    await expect(edit({ expiresAt: hours(20) })).rejects.toThrow(/support_grant_immutable|only be revoked/i);
    await expect(edit({ reason: "changed" })).rejects.toThrow(/support_grant_immutable|only be revoked/i);
    await expect(edit({ revokedAt: new Date() })).resolves.toBeDefined();
    await expect(edit({ revokedAt: null })).rejects.toThrow(/support_grant_immutable|only be revoked/i);
    const gone = await asSchool(school).transaction((tx) => tx.$executeRaw`DELETE FROM "SupportGrant" WHERE id = ${g.id}`);
    expect(gone).toBe(0); // no DELETE policy
  });
});

test.describe("the area list", () => {
  test("lib/support/areas.ts and the database CHECK name exactly the same areas (and finance is neither)", async () => {
    const [{ def }] = await db.$queryRaw<{ def: string }[]>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'SupportGrant_areas_grantable'`;
    const inDb = [...def.matchAll(/'([a-z]+)'::text/g)].map((m) => m[1]).sort();
    expect(inDb).toEqual([...SUPPORT_AREAS].sort());
    expect(inDb).not.toContain("finance");
  });
});

test.describe("platform_support_grants()", () => {
  const call = (userId: string) =>
    forUser(userId).transaction((tx) => tx.$queryRaw<Record<string, unknown>[]>`SELECT * FROM platform_support_grants()`);

  test("refused to anyone who is not a platform administrator", async () => {
    for (const who of [ordinary.id, "no-such-user"]) await expect(call(who), who).rejects.toThrow(/platform_admin_required/);
  });

  test("returns LIVE grants only - not expired, not revoked, not of a suspended school - with the school, the areas and the expiry and nothing else", async () => {
    const live = await grant(school, { areas: ["academics", "results"] });
    const revoked = await grant(school);
    await db.supportGrant.update({ where: { id: revoked.id }, data: { revokedAt: new Date() } });
    const expired = await grant(school);
    await db.$executeRaw`ALTER TABLE "SupportGrant" DISABLE TRIGGER USER`;
    await db.$executeRaw`UPDATE "SupportGrant" SET "expiresAt" = now() - interval '1 minute', "createdAt" = now() - interval '5 hours' WHERE id = ${expired.id}`;
    await db.$executeRaw`ALTER TABLE "SupportGrant" ENABLE TRIGGER USER`;
    const suspendedSchool = await createTenant({ name: "Suspended Grant School" });
    const hidden = await grant(suspendedSchool);
    await db.tenant.update({ where: { id: suspendedSchool.id }, data: { suspendedAt: new Date() } });

    const rows = await call(platformAdmin.id);
    const ids = rows.map((r) => r.grant_id);
    expect(ids).toContain(live.id);
    for (const gone of [revoked.id, expired.id, hidden.id]) expect(ids).not.toContain(gone);
    const row = rows.find((r) => r.grant_id === live.id)!;
    expect(Object.keys(row).sort()).toEqual(["areas", "expires_at", "grant_id", "tenant_id"]);
    expect([row.tenant_id, row.areas]).toEqual([school.id, ["academics", "results"]]);
  });
});

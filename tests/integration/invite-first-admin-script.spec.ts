import "../support/env";
import { Role } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, sha256Hex, type TestTenant } from "../support/db";

// `pnpm platform-admin:invite-first-admin -- <school-code> <email> --as <platform-administrator-email>`: the operator's way to re-issue a lost first
// administrator invitation when the application can't be used (task 0010 F2, ISS-0015). Run here as the real script, as a child process, against the
// test database. Same rule as the platform action: only for a school with no active ADMIN; both audit logs; the old open invitation is revoked.

const run = promisify(execFile);
const script = (...args: string[]) =>
  run(process.execPath, ["scripts/invite-first-admin.mjs", ...args], { env: process.env, cwd: process.cwd() }).then(
    (r) => ({ code: 0, out: r.stdout, err: r.stderr }),
    (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout, err: e.stderr }),
  );

let school: TestTenant;
let operator: { id: string; email: string };
const actors: string[] = [];
const openAdminInvites = (tenantId: string) =>
  db.invitation.findMany({ where: { tenantId, role: "ADMIN", acceptedAt: null, revokedAt: null } });

test.beforeAll(async () => {
  await seedInstance();
  operator = await createUser({ platformAdmin: true });
  actors.push(operator.id);
});
test.beforeEach(async () => {
  school = await createTenant({ name: "Script School", campuses: ["Only"] });
});
test.afterAll(async () => {
  await db.platformAuditLog.deleteMany({ where: { actorUserId: { in: actors } } });
  await removeCreatedTenants();
});

test.describe("scripts/invite-first-admin.mjs", () => {
  test("a school with no administrator: one open invitation to the address, the old one revoked, a link printed that matches the stored hash, BOTH logs written", async () => {
    await db.invitation.create({
      data: {
        tenantId: school.id,
        email: "lost@example.test",
        role: "ADMIN",
        tokenHash: sha256Hex("old"),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const res = await script(school.code, "Found@Example.test", "--as", operator.email.toUpperCase());
    expect(res.code, res.err).toBe(0);
    const link = /https?:\/\/\S+\/accept-invite#token=([A-Za-z0-9_-]{43})/.exec(res.out);
    expect(link, res.out).not.toBeNull();

    const open = await openAdminInvites(school.id);
    expect(open.map((i) => [i.email, i.campusId, i.invitedById])).toEqual([["found@example.test", null, operator.id]]);
    expect(open[0].tokenHash).toBe(sha256Hex(link![1]));
    expect(open[0].expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect(await db.invitation.count({ where: { tenantId: school.id, email: "lost@example.test", revokedAt: { not: null } } })).toBe(1);

    const platformLog = await db.platformAuditLog.findMany({ where: { targetTenantId: school.id } });
    expect(platformLog.map((a) => [a.action, a.actorUserId])).toEqual([["FIRST_ADMIN_REINVITED", operator.id]]);
    expect(platformLog[0].reason).toMatch(/operator/i);
    expect((await db.auditLog.findMany({ where: { tenantId: school.id } })).map((a) => a.action).sort()).toEqual([
      "INVITATION_CREATED",
      "INVITATION_REVOKED",
    ]);
  });

  test("a school that HAS an active administrator is refused and nothing is written", async () => {
    await addMembership((await createUser()).id, school.id, Role.ADMIN);
    const res = await script(school.code, "late@example.test", "--as", operator.email);
    expect(res.code).toBe(1);
    expect(res.err + res.out).toMatch(/already has an administrator/i);
    expect(await db.invitation.count({ where: { tenantId: school.id } })).toBe(0);
    expect(await db.platformAuditLog.count({ where: { targetTenantId: school.id } })).toBe(0);
  });

  test("--as is required and must name a platform administrator; an unknown school or a bad address changes nothing", async () => {
    const ordinary = await createUser({ role: Role.ADMIN });
    const cases: [string[], number][] = [
      [[school.code, "a@example.test"], 2], // no --as
      [[school.code, "a@example.test", "--as", ordinary.email], 1], // not a platform administrator
      [[school.code, "a@example.test", "--as", "nobody-here@example.test"], 1],
      [["no-such-school", "a@example.test", "--as", operator.email], 1],
      [[school.code, "not-an-address", "--as", operator.email], 2],
      [[school.code], 2],
      [["--force", school.code, "a@example.test", "--as", operator.email], 2],
    ];
    for (const [args, code] of cases) expect((await script(...args)).code, args.join(" ")).toBe(code);
    expect(await db.invitation.count({ where: { tenantId: school.id } })).toBe(0);
    expect(await db.platformAuditLog.count({ where: { targetTenantId: school.id } })).toBe(0);
  });

  test("pnpm's leading `--` is ignored; running it again replaces the previous open invitation", async () => {
    expect((await script("--", school.code, "one@example.test", "--as", operator.email)).code).toBe(0);
    expect((await script(school.code, "two@example.test", "--as", operator.email)).code).toBe(0);
    expect((await openAdminInvites(school.id)).map((i) => i.email)).toEqual(["two@example.test"]);
  });
});

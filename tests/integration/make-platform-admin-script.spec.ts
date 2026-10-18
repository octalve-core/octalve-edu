import "../support/env";
import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createUser, db, enableMfa, uniqueEmail } from "../support/db";

// `pnpm platform-admin:make -- <email>`: the operator's way to create the first platform administrator (the setup wizard never does) and the way
// back if every one is lost (plan C5). Run here as the real script, as a child process, against the test database.

const run = promisify(execFile);
const script = (...args: string[]) =>
  run(process.execPath, ["scripts/make-platform-admin.mjs", ...args], { env: process.env, cwd: process.cwd() }).then(
    (r) => ({ code: 0, out: r.stdout, err: r.stderr }),
    (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout, err: e.stderr }),
  );
const flag = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id } })).isPlatformAdmin;
const audit = (id: string) => db.platformAuditLog.findMany({ where: { actorUserId: id, action: "PLATFORM_ADMIN_GRANTED" } });

test.afterAll(async () => {
  await db.platformAuditLog.deleteMany({ where: { action: "PLATFORM_ADMIN_GRANTED" } });
});

test.describe("scripts/make-platform-admin.mjs", () => {
  test("makes the person a platform administrator - even one with no school - audits it, touches nobody else; running it again changes nothing", async () => {
    const user = await createUser();
    const bystander = await createUser();

    const res = await script(user.email);
    expect(res.code, res.err).toBe(0);
    expect(res.out).toContain(user.email);
    expect(await flag(user.id)).toBe(true);
    expect(await flag(bystander.id)).toBe(false);
    const rows = await audit(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toMatch(/operator/i);
    expect(rows[0].targetTenantId).toBeNull();

    const again = await script(user.email);
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/already/i);
    expect(await audit(user.id)).toHaveLength(1);
  });

  test("it says what is still needed: two-step verification, which the platform pages require", async () => {
    const without = await createUser();
    expect((await script(without.email)).out).toMatch(/two-step/i);
    const withMfa = await createUser();
    await enableMfa(withMfa.id);
    expect((await script(withMfa.email)).out).not.toMatch(/turn on two-step/i);
  });

  test("the address is case-insensitive, and pnpm's leading `--` is ignored", async () => {
    const user = await createUser({ email: uniqueEmail("platform") });
    const res = await script("--", user.email.toUpperCase());
    expect(res.code, res.err).toBe(0);
    expect(await flag(user.id)).toBe(true);
  });

  test("an unknown address, no address, or a flag changes nothing and exits non-zero", async () => {
    const before = await db.user.count({ where: { isPlatformAdmin: true } });
    expect((await script("nobody-here@example.test")).code).toBe(1);
    expect((await script()).code).toBe(2);
    expect((await script("--force")).code).toBe(2);
    expect(await db.user.count({ where: { isPlatformAdmin: true } })).toBe(before);
  });
});

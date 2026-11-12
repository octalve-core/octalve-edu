import "../support/env";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";

// The rules the database itself states for programs (task 0027, migration 20261116090000_programs_structure): the checks, the live-name indexes, the composite keys, row-level security and
// the append-only audit. The services check the same things first and say why; these prove the database would refuse even if one did not. The runtime role (`app_user`, through
// `forTenant`) is the one that must be unable to rewrite the audit and unable to reach another school's rows.

let a: TestTenant;
let b: TestTenant;
let admin: { id: string };
const asSchool = (t: TestTenant) => forTenant(trustedTenantId(t.id));

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Programs schema A", campuses: ["North", "South"] });
  b = await createTenant({ name: "Programs schema B", campuses: ["Elsewhere"] });
  admin = await createUser();
  await addMembership(admin.id, a.id, Role.ADMIN);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

let counter = 0;
const program = (tenantId: string, over: Record<string, unknown> = {}) =>
  db.program.create({
    data: { tenantId, name: `Program ${Date.now().toString(36)}${++counter}`, kind: "ONGOING", createdByUserId: admin.id, ...over },
  });
const group = (tenantId: string, programId: string, over: Record<string, unknown> = {}) =>
  db.programGroup.create({ data: { tenantId, programId, levelIndex: 0, name: `Group ${++counter}`, ...over } });

test.describe("a program that makes no sense is refused by the database", () => {
  test("an ongoing program has no end date; a fixed-term one has both dates, in order", async () => {
    await expect(program(a.id, { kind: "ONGOING", endsOn: new Date("2027-01-01") })).rejects.toThrow();
    await expect(program(a.id, { kind: "FIXED_TERM" })).rejects.toThrow();
    await expect(program(a.id, { kind: "FIXED_TERM", startsOn: new Date("2026-11-03") })).rejects.toThrow();
    await expect(program(a.id, { kind: "FIXED_TERM", startsOn: new Date("2026-11-03"), endsOn: new Date("2026-11-03") })).rejects.toThrow();
    await expect(program(a.id, { kind: "FIXED_TERM", startsOn: new Date("2026-11-03"), endsOn: new Date("2026-01-01") })).rejects.toThrow();
    expect((await program(a.id, { kind: "FIXED_TERM", startsOn: new Date("2026-11-03"), endsOn: new Date("2027-05-02") })).kind).toBe(
      "FIXED_TERM",
    );
    expect((await program(a.id, { kind: "ONGOING", startsOn: new Date("2026-11-03") })).endsOn).toBeNull();
  });

  test("a live program's name is unique in the school, ignoring case; an archived one's is free; another school may use it", async () => {
    const one = await program(a.id, { name: "Hifz Unique" });
    await expect(program(a.id, { name: "HIFZ UNIQUE" })).rejects.toThrow();
    await db.program.update({ where: { id: one.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    const two = await program(a.id, { name: "hifz unique" });
    await expect(db.program.update({ where: { id: one.id }, data: { status: "DRAFT", archivedAt: null } })).rejects.toThrow(); // it cannot come back while the name is taken
    expect(two.name).toBe("hifz unique");
    expect((await program(b.id, { name: "Hifz Unique" })).tenantId).toBe(b.id);
  });
});

test.describe("the tree of groups", () => {
  test("levels are 0 to 3; a top group has no parent and every other has one; live namesakes among siblings are refused", async () => {
    const p = await program(a.id);
    await expect(group(a.id, p.id, { levelIndex: 4 })).rejects.toThrow();
    await expect(group(a.id, p.id, { levelIndex: -1 })).rejects.toThrow();
    const top = await group(a.id, p.id, { name: "JSS 1" });
    await expect(group(a.id, p.id, { levelIndex: 1 })).rejects.toThrow(); // a level-1 group with no parent
    await expect(group(a.id, p.id, { levelIndex: 0, parentId: top.id })).rejects.toThrow(); // a top group with a parent
    await expect(group(a.id, p.id, { name: "jss 1" })).rejects.toThrow(); // the same name among the top groups
    const child = await group(a.id, p.id, { levelIndex: 1, parentId: top.id, name: "JSS 1" }); // the same name one level down is fine
    await expect(group(a.id, p.id, { levelIndex: 1, parentId: top.id, name: "Jss 1" })).rejects.toThrow();
    await db.programGroup.update({ where: { id: child.id }, data: { archivedAt: new Date() } });
    expect((await group(a.id, p.id, { levelIndex: 1, parentId: top.id, name: "jss 1" })).levelIndex).toBe(1); // an archived group's name is free
    await expect(
      db.programLevelLabel.create({ data: { tenantId: a.id, programId: p.id, levelIndex: 4, name: "Too deep" } }),
    ).rejects.toThrow();
  });

  test("a group, a campus link and a level name cannot name another school's row", async () => {
    const mine = await program(a.id);
    const theirs = await program(b.id);
    await expect(group(a.id, theirs.id)).rejects.toThrow(); // another school's program
    const foreign = await group(b.id, theirs.id);
    await expect(group(a.id, mine.id, { levelIndex: 1, parentId: foreign.id })).rejects.toThrow(); // another school's parent
    await expect(db.programCampus.create({ data: { tenantId: a.id, programId: mine.id, campusId: b.campuses[0].id } })).rejects.toThrow(); // another school's campus
    await expect(
      db.programLevelLabel.create({ data: { tenantId: a.id, programId: theirs.id, levelIndex: 0, name: "Planted" } }),
    ).rejects.toThrow();
    await db.programCampus.create({ data: { tenantId: a.id, programId: mine.id, campusId: a.campuses[0].id } });
  });
});

test.describe("who can run a program", () => {
  test("a program admin must be a member of the school, once per role", async () => {
    const p = await program(a.id);
    const stranger = await createUser();
    await expect(
      db.programStaff.create({ data: { tenantId: a.id, programId: p.id, userId: stranger.id, role: "ADMIN", createdByUserId: admin.id } }),
    ).rejects.toThrow();
    const member = await createUser();
    await addMembership(member.id, a.id, Role.TEACHING_STAFF, a.campuses[0].id);
    await db.programStaff.create({
      data: { tenantId: a.id, programId: p.id, userId: member.id, role: "ADMIN", createdByUserId: admin.id },
    });
    await expect(
      db.programStaff.create({ data: { tenantId: a.id, programId: p.id, userId: member.id, role: "ADMIN", createdByUserId: admin.id } }),
    ).rejects.toThrow();
    // a membership of another school does not make a place here
    const other = await createUser();
    await addMembership(other.id, b.id, Role.TEACHING_STAFF);
    await expect(
      db.programStaff.create({ data: { tenantId: a.id, programId: p.id, userId: other.id, role: "ADMIN", createdByUserId: admin.id } }),
    ).rejects.toThrow();
  });
});

test.describe("the audit is append-only and the school's own", () => {
  const entry = (tenantId: string, programId: string, over: Record<string, unknown> = {}) => ({
    tenantId,
    programId,
    actorUserId: admin.id,
    action: "PROGRAM_CHANGED",
    targetType: "Program",
    ...over,
  });

  test("the runtime role can write and read a row, but cannot change or remove it", async () => {
    const p = await program(a.id);
    const row = await asSchool(a).transaction((tx) => tx.programAudit.create({ data: entry(a.id, p.id, { reason: "A fair reason" }) }));
    expect((await asSchool(a).transaction((tx) => tx.programAudit.findMany({ where: { programId: p.id } }))).map((r) => r.id)).toEqual([
      row.id,
    ]);
    await expect(
      asSchool(a).transaction((tx) => tx.programAudit.updateMany({ where: { id: row.id }, data: { reason: "Tampered with" } })),
    ).rejects.toThrow(/permission denied|row-level security/i);
    await expect(asSchool(a).transaction((tx) => tx.programAudit.deleteMany({ where: { id: row.id } }))).rejects.toThrow(
      /permission denied|row-level security/i,
    );
    expect((await db.programAudit.findUniqueOrThrow({ where: { id: row.id } })).reason).toBe("A fair reason");
  });

  test("another school sees none of a school's programs and writes none into them", async () => {
    const p = await program(a.id);
    await asSchool(a).transaction((tx) => tx.programAudit.create({ data: entry(a.id, p.id) }));
    expect(await asSchool(b).transaction((tx) => tx.program.findMany({ where: { id: p.id } }))).toEqual([]);
    expect(await asSchool(b).transaction((tx) => tx.programAudit.findMany({ where: { programId: p.id } }))).toEqual([]);
    await expect(asSchool(b).transaction((tx) => tx.programAudit.create({ data: entry(a.id, p.id) }))).rejects.toThrow(
      /row-level security|violates/i,
    );
    await expect(
      asSchool(b).transaction((tx) =>
        tx.program.create({ data: { tenantId: a.id, name: "Planted", kind: "ONGOING", createdByUserId: admin.id } }),
      ),
    ).rejects.toThrow(/row-level security|violates/i);
    expect(await asSchool(b).transaction((tx) => tx.program.updateMany({ where: { id: p.id }, data: { name: "Renamed by B" } }))).toEqual({
      count: 0,
    });
    expect((await db.program.findUniqueOrThrow({ where: { id: p.id } })).name).not.toBe("Renamed by B");
  });
});
